
from flask import Flask, request, Response, jsonify, send_from_directory
from bank_statement_extractor import BankStatementExtractor
import tempfile
import os
import gspread
import json
from flask_cors import CORS
from pdfminer.pdfdocument import PDFPasswordIncorrect
from pdfplumber.pdf import PdfminerException
from datetime import datetime

app = Flask(__name__, static_folder='frontend_build')
CORS(app)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

extractor = BankStatementExtractor()

SHEET_ID = '13eQV3PW0JK0CydJeQyrnJWsNwXUQiFZoG0U96UFiYj8'
WORKSHEET_NAME = 'transactions'

def get_gspread_client():
    try:
        # Construct credentials from environment variables
        creds_dict = {
            "type": os.environ.get("G_SHEET_TYPE", "service_account"),
            "project_id": os.environ.get("G_SHEET_PROJECT_ID"),
            "private_key_id": os.environ.get("G_SHEET_PRIVATE_KEY_ID"),
            "private_key": os.environ.get("G_SHEET_PRIVATE_KEY", "").replace('\\n', '\n'),
            "client_email": os.environ.get("G_SHEET_CLIENT_EMAIL"),
            "client_id": os.environ.get("G_SHEET_CLIENT_ID"),
            "auth_uri": os.environ.get("G_SHEET_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
            "token_uri": os.environ.get("G_SHEET_TOKEN_URI", "https://oauth2.googleapis.com/token"),
            "auth_provider_x509_cert_url": os.environ.get("G_SHEET_AUTH_PROVIDER_X509_CERT_URL", "https://www.googleapis.com/oauth2/v1/certs"),
            "client_x509_cert_url": os.environ.get("G_SHEET_CLIENT_X509_CERT_URL")
        }
        
        # Basic validation
        if not creds_dict["private_key"] or not creds_dict["client_email"]:
            print("Missing Google Sheet credentials in environment variables.")
            return None

        gc = gspread.service_account_from_dict(creds_dict)
        return gc
    except Exception as e:
        print(f"Error creating gspread client: {e}")
        return None

@app.route('/extract', methods=['POST'])
def extract_statement():
    if 'file' not in request.files:
        return "No file part", 400
    
    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400
    
    # Check if JSON format requested
    request_json = request.args.get('format') == 'json' or request.headers.get('Accept') == 'application/json'
    password = request.form.get('password')
    
    if file:
        temp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        temp_path = temp.name
        try:
            file.save(temp_path)
            temp.close()
            
            if request_json:
                result = extractor.extract_to_json(temp_path, password=password)
                return jsonify(result)
            else:
                csv_content = extractor.extract_to_csv_string(temp_path, password=password)
                return Response(
                    csv_content,
                    mimetype="text/csv",
                    headers={"Content-disposition": "attachment; filename=statement.csv"}
                )
        except PDFPasswordIncorrect:
            return jsonify({"error": "Password required or incorrect", "code": "PASSWORD_REQUIRED"}), 401
        except PdfminerException as e:
            if isinstance(e.args[0], PDFPasswordIncorrect):
                return jsonify({"error": "Password required or incorrect", "code": "PASSWORD_REQUIRED"}), 401
            return jsonify({"error": str(e)}), 500
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

@app.route('/sync', methods=['POST'])
def sync_to_sheets():
    data = request.json
    if not data or 'transactions' not in data:
        return jsonify({"error": "Missing transactions"}), 400

    transactions = data['transactions']
    target_dates = set(data.get('dates', []))
    bank_name = data.get('bank', 'ICICI') # Default
    
    # Select worksheet based on bank
    target_worksheet_name = "harish_transactions" # Default
    if bank_name == "HDFC":
        target_worksheet_name = "jeyashree_transactions"
    
    gc = get_gspread_client()
    if not gc:
        return jsonify({"error": "Service account credentials not found"}), 500

    try:
        sh = gc.open_by_key(SHEET_ID)
        try:
            worksheet = sh.worksheet(target_worksheet_name)
        except gspread.WorksheetNotFound:
            return jsonify({"error": f"Worksheet '{target_worksheet_name}' not found"}), 404
        
        # Get all existing records
        all_records = worksheet.get_all_records()
        
        # Filter keep records NOT in target_dates
        if not all_records and not worksheet.row_values(1):
            # Init headers
            worksheet.append_row(['S No', 'Date', 'Cheque No', 'Description', 'Withdrawal', 'Deposit', 'Balance', 'Category'])
            current_rows = []
        else:
            current_rows = [r for r in all_records if str(r.get('Date')) not in target_dates]
            
        new_rows = []
        for t in transactions:
            if t.get('Date') in target_dates:
                row = {
                    'S No': t.get('S No', ''),
                    'Date': t.get('Date', ''),
                    'Cheque No': t.get('Cheque No', ''),
                    'Description': t.get('Description', ''),
                    'Withdrawal': t.get('Withdrawal', '0.00'),
                    'Deposit': t.get('Deposit', '0.00'),
                    'Balance': t.get('Balance', ''),
                    'Category': t.get('Category', '')
                }
                new_rows.append(row)
        
        final_data = current_rows + new_rows
        
        # Sort by Date (DD/MM/YYYY)
        def parse_date(row):
            date_str = row.get('Date', '')
            try:
                return datetime.strptime(date_str, "%d/%m/%Y")
            except ValueError:
                return datetime.min 
                
        final_data.sort(key=parse_date)
        
        # Write back
        # gspread update is easiest with list of lists
        headers = ['S No', 'Date', 'Cheque No', 'Description', 'Withdrawal', 'Deposit', 'Balance', 'Category']
        
        output_data = [headers]
        for r in final_data:
            row_list = [r.get(h, '') for h in headers]
            output_data.append(row_list)
            
        worksheet.clear()
        worksheet.update('A1', output_data)
        
        return jsonify({"status": "success", "count": len(new_rows), "worksheet": target_worksheet_name})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/check_status', methods=['POST'])
def check_status():
    data = request.json
    transactions = data.get('transactions', [])
    bank_name = data.get('bank', 'ICICI')
    
    if not transactions:
        return jsonify({})
        
    target_worksheet_name = "harish_transactions"
    if bank_name == "HDFC":
        target_worksheet_name = "jeyashree_transactions"
        
    try:
        gc = get_gspread_client()
        if not gc:
             return jsonify({})
             
        sh = gc.open_by_key(SHEET_ID)
        try:
            worksheet = sh.worksheet(target_worksheet_name)
            sheet_records = worksheet.get_all_records()
        except gspread.WorksheetNotFound:
            # Sheet doesn't exist, so everything is missing (Red)
            dates = set(t['Date'] for t in transactions if t.get('Date'))
            return jsonify({ d: 'red' for d in dates })
            
        # Helper to create a signature for a transaction
        def get_sig(t):
            # Normalize to avoid type mismatches (gspread returns ints/floats, pdf returns strings)
            d = str(t.get('Date', '')).strip()
            desc = str(t.get('Description', '')).strip()
            
            # Normalize amounts: remove commas, ensure 2 decimal Float -> String
            def norm_amt(val):
                if isinstance(val, (int, float)):
                    return f"{float(val):.2f}"
                s = str(val).replace(',', '').strip()
                if not s: return "0.00"
                try:
                    return f"{float(s):.2f}"
                except:
                    return s
            
            w = norm_amt(t.get('Withdrawal', '0'))
            dep = norm_amt(t.get('Deposit', '0'))
            
            return f"{d}_{desc}_{w}_{dep}"
            
        # Map sheet signatures to their Category status
        sheet_map = {}
        for r in sheet_records:
            sig = get_sig(r)
            sheet_map[sig] = r.get('Category', '')
            # Debug log first few
            if len(sheet_map) < 3:
                print(f"DEBUG SHEET SIG: {sig} -> {r.get('Category', '')}")
            
        # Group PDF transactions by Date
        date_status = {}
        transactions_by_date = {}
        for t in transactions:
            d = t.get('Date')
            if not d: continue
            if d not in transactions_by_date: transactions_by_date[d] = []
            transactions_by_date[d].append(t)
            
        for date, txns in transactions_by_date.items():
            all_present = True
            all_categorized = True
            
            for t in txns:
                sig = get_sig(t)
                
                # Debug mismatch
                if sig not in sheet_map:
                    print(f"DEBUG MISMATCH: PDF Sig '{sig}' not found in Sheet keys")
                    all_present = False
                    break
                if not sheet_map[sig]: # Category is empty
                    print(f"DEBUG UNCATEGORIZED: {sig}")
                    all_categorized = False
            
            if all_present and all_categorized:
                date_status[date] = 'green'
            else:
                date_status[date] = 'red'
                
        return jsonify({
            "dates": date_status,
            "categories": sheet_map
        })

    except Exception as e:
        print(f"Check status failed: {e}")
        return jsonify({})

CATEGORIES_WORKSHEET = 'categories'
DEFAULT_CATEGORIES = ['food', 'transport', 'rent', 'salary', 'bills', 'shopping', 'investment', 'other', 'entertainment', 'health']

def get_or_create_categories_sheet(sh):
    try:
        ws = sh.worksheet(CATEGORIES_WORKSHEET)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=CATEGORIES_WORKSHEET, rows=100, cols=1)
        # Populate defaults
        # Transpose to column
        data = [[c] for c in DEFAULT_CATEGORIES]
        ws.update('A1', data)
    return ws

@app.route('/categories', methods=['GET', 'POST', 'DELETE'])
def manage_categories():
    gc = get_gspread_client()
    if not gc:
        return jsonify({"error": "Service account credentials not found"}), 500
        
    try:
        sh = gc.open_by_key(SHEET_ID)
        ws = get_or_create_categories_sheet(sh)
        
        if request.method == 'GET':
            # Read Column A
            vals = ws.col_values(1)
            return jsonify(vals)
            
        if request.method == 'POST':
            data = request.json
            new_cat = data.get('category', '').strip().lower()
            if not new_cat:
                return jsonify({"error": "Category couldn't be empty"}), 400
            
            existing = ws.col_values(1)
            if new_cat in existing:
                 return jsonify(existing)
                 
            # Append
            ws.append_row([new_cat])
            return jsonify(existing + [new_cat])

        if request.method == 'DELETE':
            data = request.json
            cat_to_remove = data.get('category', '').strip().lower()
            if not cat_to_remove:
                return jsonify({"error": "Category required"}), 400
            
            existing = ws.col_values(1)
            if cat_to_remove in existing:
                # Filter out
                updated = [c for c in existing if c != cat_to_remove]
                # Rewrite column logic using batch update for efficiency/simplicity
                # Clear entire column first (up to reasonable limit or just rewrite)
                ws.clear()
                ws.update('A1', [[c] for c in updated])
                return jsonify(updated)
            return jsonify(existing)
            
    except Exception as e:
        import traceback
        traceback.print_exc()

@app.route('/last_sync', methods=['GET'])
def get_last_sync_dates():
    gc = get_gspread_client()
    if not gc:
        return jsonify({"error": "Service account credentials not found"}), 500
        
    try:
        sh = gc.open_by_key(SHEET_ID)
        
        result = {}
        
        for name, ws_name in [("ICICI", "harish_transactions"), ("HDFC", "jeyashree_transactions")]:
            try:
                ws = sh.worksheet(ws_name)
                # Date is in 2nd column (index 1), row 1 is header
                # Get all values in column 2
                dates = ws.col_values(2)[1:] # Skip header
                
                valid_dates = []
                for d in dates:
                    try:
                        valid_dates.append(datetime.strptime(d, "%d/%m/%Y"))
                    except:
                        pass
                
                if valid_dates:
                    latest = max(valid_dates)
                    result[name] = latest.strftime("%d/%m/%Y")
                else:
                    result[name] = "N/A"
            except gspread.WorksheetNotFound:
                result[name] = "Sheet not found"
            except Exception as e:
                print(f"Error fetching {name}: {e}")
                result[name] = "Error"
                
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
