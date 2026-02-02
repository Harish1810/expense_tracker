
import pdfplumber
import csv
import sys

def extract_statement_final(pdf_path, csv_path):
    print(f"Extracting from {pdf_path}...")
    
    transactions = []
    
    with pdfplumber.open(pdf_path) as pdf:
        # Assuming single page or iterating all
        for page_idx, page in enumerate(pdf.pages):
            print(f"Processing Page {page_idx + 1}")
            words = page.extract_words()
            
            # Filter Header (Top < 235 based on analysis)
            # Adjust if multiple pages have different headers or just first page
            # Typically subseq pages have headers too.
            # Let's verify header position on page 1: header text ended around 235.
            # We can use a heuristic: if we find "Date" and "Balance" headers, we know where header ends.
            
            # Simple heuristic for now: Sort by top.
            # Find lines.
            
            # 1. Group words into lines
            lines = {} # Key: approx_top, Value: list of words
            for w in words:
                # Round top to nearest 3 pixels to group
                approx_top = round(w['top'] / 3) * 3
                if approx_top not in lines:
                    lines[approx_top] = []
                lines[approx_top].append(w)
            
            # Sort lines by top
            sorted_tops = sorted(lines.keys())
            
            main_lines = [] # (top, row_data_dict)
            desc_lines = [] # (top, text)
            
            for top in sorted_tops:
                line_words = lines[top]
                line_words.sort(key=lambda x: x['x0'])
                
                # Check for Main Line signature: S No (X<50) and Date (X~60-90)
                # Actually, strictly looking for numeric SNo at Left
                
                s_no = None
                date = None
                withdrawal = None
                deposit = None
                balance = None
                cheque = None
                
                # Column Buckets (approx X0)
                # SNo: < 50
                # Date: 50 - 110
                # Cheque: 110 - 180
                # Desc: 180 - 390
                # Withdrawal: 390 - 460
                # Deposit: 460 - 520
                # Balance: > 520
                
                line_desc_parts = []
                
                has_sno = False
                has_date = False
                
                for w in line_words:
                    x = w['x0']
                    text = w['text']
                    
                    if x < 50:
                        if text.replace('.', '').isdigit():
                            s_no = text
                            has_sno = True
                    elif 50 <= x < 110:
                        # minimal date validation
                        if '.' in text or '/' in text or '-' in text:
                            date = text
                            has_date = True
                    elif 110 <= x < 180:
                        if cheque: cheque += " " + text
                        else: cheque = text
                    elif 180 <= x < 390:
                        line_desc_parts.append(text)
                    elif 390 <= x < 460:
                        withdrawal = text
                    elif 460 <= x < 520:
                        deposit = text
                    elif x >= 520:
                        balance = text
                
                line_text = " ".join(line_desc_parts)
                
                if has_sno and has_date:
                    # Found a Main Line
                    data = {
                        'S No': s_no,
                        'Date': date,
                        'Cheque No': cheque if cheque else '',
                        'Withdrawal': withdrawal if withdrawal else '0.00',
                        'Deposit': deposit if deposit else '0.00',
                        'Balance': balance,
                        'Description': line_text # This line might have desc parts too
                    }
                    main_lines.append((top, data))
                elif line_desc_parts:
                    # It's a description line (or header garbage, we'll filter later)
                    # Use the raw joined text from the whole line if "desc parts" were detected
                    # But wait, what if it's the header line? "Transaction Remarks"
                    # We should filter headers.
                    # check if line contains "Remarks" or "Date" or "Balance"
                    full_line_text = " ".join([w['text'] for w in line_words])
                    if "Remarks" in full_line_text or "Balance" in full_line_text or "Withdrawal" in full_line_text:
                        continue
                    
                    # Only map the parts that fell in descriptor column
                    if line_text:
                         desc_lines.append((top, line_text))
            
            # Now assign desc lines to closest main line
            for d_top, d_text in desc_lines:
                if not main_lines:
                    continue
                
                # Find closest main line
                closest_main = min(main_lines, key=lambda m: abs(m[0] - d_top))
                # Threshold? If too far, maybe it's footer?
                # e.g. "Page 1 of 1"
                if abs(closest_main[0] - d_top) > 50: # 50px tolerance
                    continue
                
                # Append text. Check logic: Prepend or Append?
                # If d_top < m_top, it's above.
                # If d_top > m_top, it's below.
                # We can construct list and join later.
                
                m_data = closest_main[1]
                if 'DescLines' not in m_data:
                    m_data['DescLines'] = []
                
                m_data['DescLines'].append((d_top, d_text))
            
            # Finalize Main Lines
            for top, data in main_lines:
                # Collect all desc parts: the one on main line + assigned ones
                combined_desc_list = []
                
                # Current line desc
                if data['Description']:
                    combined_desc_list.append((top, data['Description']))
                
                # Assigned lines
                assigned_lines = data.pop('DescLines', [])
                combined_desc_list.extend(assigned_lines)
                
                # Sort by top
                combined_desc_list.sort(key=lambda x: x[0])
                
                final_desc = " ".join([x[1] for x in combined_desc_list])
                data['Description'] = final_desc
                
                transactions.append(data)

    print(f"Extracted {len(transactions)} transactions.")
    
    # Write to CSV
    headers = ['S No', 'Date', 'Cheque No', 'Description', 'Withdrawal', 'Deposit', 'Balance']
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(transactions)
    
    print(f"Written to {csv_path}")

import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Extract bank statement to CSV.')
    parser.add_argument('pdf_path', help='Path to the input PDF file')
    parser.add_argument('csv_path', help='Path to the output CSV file')
    args = parser.parse_args()

    extract_statement_final(args.pdf_path, args.csv_path)
