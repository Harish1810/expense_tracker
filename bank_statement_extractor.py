
import pdfplumber
import csv
import io
import json
import os

class BankStatementExtractor:
    def __init__(self, config_path='bank_formats.json'):
        self.config = self.load_config(config_path)

    def load_config(self, config_path):
        if not os.path.isabs(config_path):
            # assume relative to this file if not absolute
            base_dir = os.path.dirname(os.path.abspath(__file__))
            config_path = os.path.join(base_dir, config_path)
        
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Warning: Config file not found at {config_path}")
            return []

    def extract(self, pdf_path, password=None):
        """
        Extracts transactions from a PDF file path.
        Returns a dict: {'transactions': list, 'bank': str}
        """
        print(f"Extracting from {pdf_path}...")
        transactions = []
        
        # Default to first format marked as default or just the last one if none
        selected_format = next((f for f in self.config if f.get('detection', {}).get('default')), self.config[-1] if self.config else None)
        bank_name = selected_format['name'] if selected_format else "Unknown"
        
        try:
            with pdfplumber.open(pdf_path, password=password) as pdf:
                # Detect format from first page (usually sufficient)
                if len(pdf.pages) > 0:
                    first_page_words = pdf.pages[0].extract_words()
                    detected = self._detect_format(first_page_words)
                    if detected:
                        selected_format = detected
                        bank_name = selected_format['name']
                        print(f"Detected Format: {bank_name}")
                
                if not selected_format:
                    raise Exception("No suitable format configuration found.")

                for page_idx, page in enumerate(pdf.pages):
                    print(f"Processing Page {page_idx + 1}")
                    page_transactions = self._parse_page(page, selected_format)
                    transactions.extend(page_transactions)
                    
        except Exception as e:
             print(f"Error processing PDF: {e}")
             raise e
        
        return {
            "bank": bank_name,
            "transactions": transactions
        }
    
    def _detect_format(self, words):
        # Gather all text to check against markers
        # Simple implementation: check if any marker is present in any word
        # Ideally we might want full text search but words check is fast
        word_texts = set(w['text'] for w in words)
        
        for fmt in self.config:
            detection = fmt.get('detection', {})
            # Check text_present
            if 'text_present' in detection:
                markers = detection['text_present']
                # If any marker is found, we assume this format
                # Using 'any' match logic here as per previous logic (if "WithdrawalAmt." in words)
                if any(marker in word_texts for marker in markers):
                    return fmt
        
        # If no specific marker found, return default
        default = next((f for f in self.config if f.get('detection', {}).get('default')), None)
        return default

    def _clean_amount(self, amount_str):
        if not amount_str: return "0.00"
        return amount_str.replace(',', '').strip()

    def _normalize_date(self, date_str, date_fmt):
        if not date_str: return ""
        date_str = date_str.strip()
        
        # Basic normalization to DD/MM/YYYY
        if date_fmt == "DD/MM/YY":
             if '/' in date_str:
                parts = date_str.split('/')
                if len(parts) == 3 and len(parts[-1]) == 2:
                    parts[-1] = "20" + parts[-1]
                    return "/".join(parts)
        
        if '.' in date_str:
            return date_str.replace('.', '/')
            
        return date_str

    def _parse_page(self, page, fmt_config):
        words = page.extract_words()
        
        # Group into lines
        lines = {} 
        for w in words:
            approx_top = round(w['top'] / 3) * 3
            if approx_top not in lines:
                lines[approx_top] = []
            lines[approx_top].append(w)
            
        sorted_tops = sorted(lines.keys())
        
        main_lines = []     # (top, data_dict)
        orphan_lines = []   # (top, text) - for nearest neighbor strategy
        transactions = []
        
        columns = fmt_config.get('columns', [])
        exclusions = fmt_config.get('exclusions', [])
        multiline_strategy = fmt_config.get('multiline_strategy', 'append_to_previous')
        
        for top in sorted_tops:
            line_words = lines[top]
            line_words.sort(key=lambda x: x['x0'])
            
            full_line_text = " ".join([w['text'] for w in line_words])
            
            # Check exclusions
            is_excluded = False
            for excl in exclusions:
                if excl.lower() in full_line_text.lower():
                    is_excluded = True
                    break
            
            # Additional check from legacy code: if it looks like a header row specific to ICICI
            # "Remarks" in full_line_text etc is now in exclusions list in json
            
            if is_excluded:
                continue
                
            if len(line_words) < 2 and multiline_strategy == 'append_to_previous':
                 pass # Might be noise, but allow if it could be description part
            
            # Extract column data
            row_data = {col['name']: None for col in columns}
            row_data['Description_Parts'] = [] # Helper to accumulate description
            
            has_date = False
            date_col_name = next((c['name'] for c in columns if c['type'] == 'date'), 'Date')
            
            # Iterate words and slot into columns
            for w in line_words:
                x = w['x0']
                text = w['text']
                mid_x = (w['x0'] + w['x1']) / 2
                
                matched_col = None
                for col in columns:
                    if col['x_min'] <= mid_x < col['x_max']:
                        matched_col = col
                        break
                    # Fallback if x matches start
                    if matched_col is None and col['x_min'] <= x < col['x_max']:
                        matched_col = col

                if matched_col:
                    col_name = matched_col['name']
                    col_type = matched_col['type']
                    
                    if col_type == 'date':
                        # Basic validation for date: must len>=6, have separator, AND have digit
                        if len(text) >= 6 and ('.' in text or '/' in text or '-' in text) and any(c.isdigit() for c in text):
                            row_data[col_name] = text
                            has_date = True
                    elif col_type == 'amount':
                        # Should look like number
                        if any(c.isdigit() for c in text):
                            row_data[col_name] = text
                    elif col_name == 'Description':
                         row_data['Description_Parts'].append(text)
                    else:
                         if row_data[col_name]:
                             row_data[col_name] += " " + text
                         else:
                             row_data[col_name] = text

            # Construct Description string
            if row_data['Description_Parts']:
                row_data['Description'] = " ".join(row_data['Description_Parts'])
            # Clean up temp key
            del row_data['Description_Parts']

            # If we found a date, it's likely a main transaction line
            if has_date:
                # Normalize values
                for col in columns:
                    cname = col['name']
                    raw_val = row_data.get(cname)
                    if col['type'] == 'amount':
                        row_data[cname] = self._clean_amount(raw_val)
                    elif col['type'] == 'date':
                        row_data[cname] = self._normalize_date(raw_val, fmt_config.get('date_format'))
                    elif raw_val is None:
                        row_data[cname] = ""
                
                main_lines.append((top, row_data))
                
                # If strategy is append_to_previous, we just append to list and current becomes 'previous'
                if multiline_strategy == 'append_to_previous':
                    transactions.append(row_data)

            elif multiline_strategy == 'append_to_previous':
                # No date, append description to previous transaction
                if transactions and row_data.get('Description'):
                     transactions[-1]['Description'] += " " + row_data['Description']
            
            elif multiline_strategy == 'nearest_neighbor':
                # Store potential description line
                if row_data.get('Description'):
                    orphan_lines.append((top, row_data['Description']))

        # Handle nearest_neighbor strategy
        if multiline_strategy == 'nearest_neighbor':
            for d_top, d_text in orphan_lines:
                if not main_lines: continue
                
                # Find closest main line
                # Ideally check vertical distance
                closest_main = min(main_lines, key=lambda m: abs(m[0] - d_top))
                
                # Threshold (e.g. 50 pixels)
                if abs(closest_main[0] - d_top) > 50:
                    continue
                    
                m_data = closest_main[1]
                if 'DescLines' not in m_data: m_data['DescLines'] = []
                m_data['DescLines'].append((d_top, d_text))
            
            # Reconstruct descriptions for main lines
            for top, data in main_lines:
                combined = []
                if data['Description']:
                    combined.append((top, data['Description']))
                
                if 'DescLines' in data:
                    combined.extend(data['DescLines'])
                    del data['DescLines'] # cleanup
                
                combined.sort(key=lambda x: x[0]) # sort by top (vertical order)
                data['Description'] = " " .join([x[1] for x in combined])
                
                transactions.append(data)
                
        return transactions

    def extract_to_csv_string(self, pdf_path, password=None):
        """
        Extracts and returns CSV content as a string.
        """
        result = self.extract(pdf_path, password=password)
        transactions = result['transactions']
        output = io.StringIO()
        headers = ['S No', 'Date', 'Cheque No', 'Description', 'Withdrawal', 'Deposit', 'Balance']
        writer = csv.DictWriter(output, fieldnames=headers, extrasaction='ignore') # ignore extra keys if any
        writer.writeheader()
        writer.writerows(transactions)
        return output.getvalue()

    def extract_to_json(self, pdf_path, password=None):
        """
        Extracts and returns list of dictionaries.
        """
        return self.extract(pdf_path, password=password)

    def extract_to_file(self, pdf_path, csv_path, password=None):
        """
        Extracts and writes to a file.
        """
        csv_content = self.extract_to_csv_string(pdf_path, password=password)
        with open(csv_path, 'w', newline='') as f:
            f.write(csv_content)
        print(f"Written to {csv_path}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Extract bank statement to CSV.')
    parser.add_argument('pdf_path', help='Path to the input PDF file')
    parser.add_argument('csv_path', help='Path to the output CSV file')
    parser.add_argument('--password', help='Password for PDF file', default=None)
    args = parser.parse_args()

    extractor = BankStatementExtractor()
    extractor.extract_to_file(args.pdf_path, args.csv_path, password=args.password)
