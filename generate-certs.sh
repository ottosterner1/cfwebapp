# Create directory for certificates if it doesn't exist
mkdir -p certs

# Generate a private key
openssl genrsa -out certs/key.pem 2048

# Create a certificate signing request with appropriate Subject Alternative Names
cat > certs/openssl.cnf << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C=US
ST=State
L=City
O=Development
OU=IT
CN=cfwebapp.local

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = cfwebapp.local
DNS.2 = wilton.cfwebapp.local
DNS.3 = admin.cfwebapp.local
DNS.4 = demo.cfwebapp.local
EOF

# Create a CSR using the configuration
openssl req -new -key certs/key.pem -out certs/csr.pem -config certs/openssl.cnf

# Create a self-signed certificate
openssl x509 -req -days 365 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem -extensions req_ext -extfile certs/openssl.cnf