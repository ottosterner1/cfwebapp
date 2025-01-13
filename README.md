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
tree -I "__pycache__|venv|node_modules|migrations|instance"
flask run --host=localhost --port 3000



## Flask coaching app
source venv/bin/activate

export FLASK_APP=run.py
export FLASK_ENV=development

flask run --host=localhost --port=3000

flask db migrate -m "Updating report columns"

