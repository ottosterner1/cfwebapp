# coaching-automation
Wilton Coaching Automation

## Virtual Env
python3 -m venv .venv
source .venv/bin/activate

## Install dependencies
pip install -r requirements.txt

## Create a application using pyinstaller - emailing recommendation
pyinstaller --onefile --windowed --add-data "config/email_password.txt:config" recommendation-email-automation.py

pyinstaller --onefile --windowed \
    --name ContactDetailsScript \
    --hidden-import=tkinter \
    --hidden-import=openpyxl \
    --hidden-import=pandas \
    src/contact_details_registers.py

## Directory Structure Coaching app
tree -I "__pycache__|venv|node_modules|migrations|instance|assets"
flask run --host=localhost --port 3000

## Flask coaching app
source venv/bin/activate

export FLASK_APP=run.py
export FLASK_ENV=development

flask run --host=localhost --port=3000

flask db migrate -m "Updating report columns"

docker ps
docker exec -it [CONTAINER_ID] bash -c "python -m flask db migrate -m 'Updating report columns' && p
ython -m flask db upgrade"


## Docker App Commands
docker-compose down -v 
docker-compose up --build

## Database migration (both locally and remote)


## Local SSL Certificate Setup

This application uses HTTPS locally with self-signed certificates. Follow these instructions to set up or renew certificates.

### Prerequisites
- OpenSSL

# Local SSL Certificate Setup

This application uses HTTPS locally with self-signed certificates. Follow these instructions to set up or renew certificates.

## Prerequisites
- OpenSSL

## Generating New SSL Certificates

1. Create the certificates directory if it doesn't exist:
   ```bash
   mkdir -p certs
   ```

2. Generate a new private key:
   ```bash
   openssl genrsa -out certs/server.key 2048
   ```

3. Create a self-signed certificate:
   ```bash
   openssl req -new -x509 -key certs/server.key -out certs/server.crt -days 365 -subj "/CN=cfwebapp.local" -addext "subjectAltName = DNS:cfwebapp.local"
   ```

4. Trust the certificate on your local machine:
   
   **On macOS:**
   - Open Keychain Access (Applications > Utilities > Keychain Access)
   - Import the certificate: File > Import Items > select certs/server.crt
   - Find the imported certificate, double-click it
   - Expand the "Trust" section
   - Change "When using this certificate" to "Always Trust"
   - Close the window (you'll be prompted for your password)
   
   **On Windows:**
   - Open PowerShell as Administrator
   - Run: `Import-Certificate -FilePath ".\certs\server.crt" -CertStoreLocation Cert:\LocalMachine\Root`
   
   **On Linux:**
   - Copy to trusted certificates directory:
     ```bash
     sudo cp certs/server.crt /usr/local/share/ca-certificates/
     sudo update-ca-certificates
     ```

5. Update your hosts file:
   ```bash
   sudo nano /etc/hosts
   ```
   
   Add or confirm this line:
   ```
   127.0.0.1 cfwebapp.local
   ```

6. Restart Docker containers:
   ```bash
   docker-compose down
   docker-compose up
   ```

7. Access the application at https://cfwebapp.local:8443

## Troubleshooting

If you experience SSL certificate issues:

1. Ensure the certificates exist in the certs directory with correct names (server.key and server.crt)
2. Verify the certificates are properly trusted by your operating system
3. Check that the Docker container has proper access to the certificates
4. Clear browser cookies and cache related to cfwebapp.local
5. Try accessing the site first directly at https://cfwebapp.local:8443 before using authentication

## Certificate Renewal

SSL certificates should be renewed when they expire (typically after 365 days). Follow the generation steps above to create new certificates, then restart the Docker containers.

## Files Explanation

- `server.key` - Your private key for the local dev environment (keep this)
- `server.crt` - Your SSL certificate for the local dev environment (keep this)

Other certificate-related files that may be present:
- `ca.key` - CA private key (only needed during certificate creation)
- `ca.crt` - CA certificate (only needed during certificate creation)
- `key.pem` - Alternative name for private key
- `cert.pem` - Alternative name for certificate
- `server.csr` - Certificate signing request (only needed during certificate creation)
- `server.ext` - Extensions file (only needed during certificate creation)
- `ca.srl` - CA serial number file (only needed during certificate creation)

To clean up unnecessary files, you can run:
```bash
rm ca.key ca.crt key.pem server.csr server.ext ca.srl cert.pem
```

## OAuth and Session Troubleshooting

If you experience issues with OAuth authentication flow or session management:

1. Clear all browser cookies and session data for cfwebapp.local
2. Verify that your browser allows third-party cookies
3. Access the site directly via https://cfwebapp.local:8443 first
4. Check that your Flask session configuration is properly set up:
   ```python
   app.config.update(
       SESSION_COOKIE_SECURE=True,
       SESSION_COOKIE_HTTPONLY=True,
       SESSION_COOKIE_SAMESITE='Lax',
       SESSION_COOKIE_DOMAIN='cfwebapp.local'
   )
   ```
5. Ensure that the redirection URI configured in your OAuth provider (AWS Cognito) 
   matches exactly what your application is using (including protocol and port)