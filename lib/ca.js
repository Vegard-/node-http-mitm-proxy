var FS = require('fs');
var Forge = require('node-forge');
var pki = Forge.pki;

var CAattrs = [{
  name: 'commonName',
  value: 'NodeMITMProxyCA'
}, {
  name: 'countryName',
  value: 'Internet'
}, {
  shortName: 'ST',
  value: 'Internet'
}, {
  name: 'localityName',
  value: 'Internet'
}, {
  name: 'organizationName',
  value: 'Node MITM Proxy CA'
}, {
  shortName: 'OU',
  value: 'CA'
}];

var CAextensions = [{
  name: 'basicConstraints',
  cA: true
}, {
  name: 'keyUsage',
  keyCertSign: true,
  digitalSignature: true,
  nonRepudiation: true,
  keyEncipherment: true,
  dataEncipherment: true
}, {
  name: 'extKeyUsage',
  serverAuth: true,
  clientAuth: true,
  codeSigning: true,
  emailProtection: true,
  timeStamping: true
}, {
  name: 'nsCertType',
  client: true,
  server: true,
  email: true,
  objsign: true,
  sslCA: true,
  emailCA: true,
  objCA: true
}, {
  name: 'subjectKeyIdentifier'
}];

var ServerAttrs = [{
  name: 'countryName',
  value: 'Internet'
}, {
  shortName: 'ST',
  value: 'Internet'
}, {
  name: 'localityName',
  value: 'Internet'
}, {
  name: 'organizationName',
  value: 'Node MITM Proxy CA'
}, {
  shortName: 'OU',
  value: 'Node MITM Proxy Server Certificate'
}];

var ServerExtensions = [{
  name: 'basicConstraints',
  cA: false
}, {
  name: 'keyUsage',
  keyCertSign: false,
  digitalSignature: true,
  nonRepudiation: false,
  keyEncipherment: true,
  dataEncipherment: true
}, {
  name: 'extKeyUsage',
  serverAuth: true,
  clientAuth: true,
  codeSigning: false,
  emailProtection: false,
  timeStamping: false
}, {
  name: 'nsCertType',
  client: true,
  server: true,
  email: false,
  objsign: false,
  sslCA: false,
  emailCA: false,
  objCA: false
}, {
  name: 'subjectKeyIdentifier'
}];

var CA = function (caFolder) {
  this.baseCAFolder = caFolder;
  this.certsFolder = this.baseCAFolder + '/certs';
  this.keysFolder = this.baseCAFolder + '/keys';
  try {
    FS.mkdirSync(this.baseCAFolder);
  } catch (e) { /* no op */ }
  try {
    FS.mkdirSync(this.certsFolder);
  } catch (e) { /* no op */ }
  try {
    FS.mkdirSync(this.keysFolder);
  } catch (e) { /* no op */ }
  try {
    var stats = FS.statSync(this.certsFolder + '/ca.pem');
    this.loadCA();
  } catch (e) {
    this.generateCA();
  }
};

CA.prototype.randomSerialNumber = function () {
	// generate random 16 bytes hex string
	var sn = '';
	for (var i=0; i<4; i++) {
		sn += ('00000000' + Math.floor(Math.random()*Math.pow(256, 4)).toString(16)).slice(-8);
	}
	return sn;
}

CA.prototype.generateCA = function () {
  var keys = pki.rsa.generateKeyPair(2048);
  var cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = this.randomSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  cert.setSubject(CAattrs);
  cert.setIssuer(CAattrs);
  cert.setExtensions(CAextensions);
  cert.sign(keys.privateKey, Forge.md.sha256.create());
  this.CAcert = cert;
  this.CAkeys = keys;
  FS.writeFileSync(this.certsFolder + '/ca.pem', pki.certificateToPem(cert));
  FS.writeFileSync(this.keysFolder + '/ca.private.key', pki.privateKeyToPem(keys.privateKey));
  FS.writeFileSync(this.keysFolder + '/ca.public.key', pki.publicKeyToPem(keys.publicKey));
};

CA.prototype.loadCA = function () {
  var certPEM = FS.readFileSync(this.certsFolder + '/ca.pem');
  var keyPrivatePEM = FS.readFileSync(this.keysFolder + '/ca.private.key');
  var keyPublicPEM = FS.readFileSync(this.keysFolder + '/ca.public.key');
  this.CAcert = pki.certificateFromPem(certPEM);
  this.CAkeys = {
    privateKey: pki.privateKeyFromPem(keyPrivatePEM),
    publicKey: pki.publicKeyFromPem(keyPublicPEM)
  };
};

CA.prototype.generateServerCertificateKeys = function (hosts, cb) {
  if (typeof(hosts) === "string") hosts = [hosts];
  var mainHost = hosts[0];
  var keysServer = pki.rsa.generateKeyPair(1024);
  var certServer = pki.createCertificate();
  certServer.publicKey = keysServer.publicKey;
  certServer.serialNumber = this.randomSerialNumber();
  certServer.validity.notBefore = new Date();
  certServer.validity.notAfter = new Date();
  certServer.validity.notAfter.setFullYear(certServer.validity.notBefore.getFullYear() + 2);
  var attrsServer = ServerAttrs.slice(0);
  attrsServer.unshift({
    name: 'commonName',
    value: mainHost
  })
  certServer.setSubject(attrsServer);
  certServer.setIssuer(this.CAcert.issuer.attributes);
  certServer.setExtensions(ServerExtensions.concat([{
    name: 'subjectAltName',
    altNames: hosts.map(function(host) {
      return {type: 2, value: host};
    })
  }]));
  certServer.sign(this.CAkeys.privateKey, Forge.md.sha256.create());
  var certPem = pki.certificateToPem(certServer);
  var keyPrivatePem = pki.privateKeyToPem(keysServer.privateKey)
  var keyPublicPem = pki.publicKeyToPem(keysServer.publicKey)
  FS.writeFile(this.certsFolder + '/' + mainHost.replace(/\*/g, '_') + '.pem', certPem);
  FS.writeFile(this.keysFolder + '/' + mainHost.replace(/\*/g, '_') + '.key', keyPrivatePem);
  FS.writeFile(this.keysFolder + '/' + mainHost.replace(/\*/g, '_') + '.public.key', keyPublicPem);
  cb(certPem, keyPrivatePem);
};

CA.prototype.getCACertPath = function () {
  return this.certsFolder + '/ca.pem';
};
module.exports = CA;
