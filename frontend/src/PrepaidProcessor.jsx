import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '';

const fmt = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PrepaidProcessor({ categories }) {
  const [originalData, setOriginalData] = useState([]);
  const [uniqueDates, setUniqueDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [dateStatus, setDateStatus] = useState({});
  const [existingCategories, setExistingCategories] = useState({});
  const [fetching, setFetching] = useState(false);

  // Monthly income state
  const [incomeDefault, setIncomeDefault] = useState(8800);
  const [incomeOverrides, setIncomeOverrides] = useState({});
  const [incomeMonths, setIncomeMonths] = useState([]);
  const [editingIncomeMonth, setEditingIncomeMonth] = useState(null);
  const [incomeInput, setIncomeInput] = useState('');
  const [incomeSaving, setIncomeSaving] = useState(false);

  useEffect(() => { fetchIncomeData(); }, []);

  const fetchIncomeData = async () => {
    try {
      const resp = await axios.get(`${API_BASE}/prepaid_income`);
      setIncomeDefault(resp.data.default || 8800);
      setIncomeOverrides(resp.data.overrides || {});
      setIncomeMonths(resp.data.month_years || []);
    } catch (e) {
      console.error('Failed to fetch prepaid income', e);
    }
  };

  const effectiveIncome = (monthYear) => {
    if (monthYear in incomeOverrides) return incomeOverrides[monthYear];
    return incomeDefault;
  };

  const handleSaveIncome = async (monthYear) => {
    const amount = parseFloat(incomeInput);
    if (isNaN(amount) || amount < 0) return;
    setIncomeSaving(true);
    try {
      await axios.post(`${API_BASE}/prepaid_income`, { month_year: monthYear, amount });
      setIncomeOverrides(prev => ({ ...prev, [monthYear]: amount }));
      setEditingIncomeMonth(null);
      setIncomeInput('');
    } catch (e) {
      console.error('Failed to save income', e);
    } finally {
      setIncomeSaving(false);
    }
  };

  const handleDeleteIncome = async (monthYear) => {
    setIncomeSaving(true);
    try {
      await axios.delete(`${API_BASE}/prepaid_income`, { data: { month_year: monthYear } });
      setIncomeOverrides(prev => {
        const next = { ...prev };
        delete next[monthYear];
        return next;
      });
    } catch (e) {
      console.error('Failed to update income', e);
    } finally {
      setIncomeSaving(false);
    }
  };

  const handleSkipIncome = async (monthYear) => {
    setIncomeSaving(true);
    try {
      await axios.post(`${API_BASE}/prepaid_income`, { month_year: monthYear, amount: 0 });
      setIncomeOverrides(prev => ({ ...prev, [monthYear]: 0 }));
    } catch (e) {
      console.error('Failed to skip income', e);
    } finally {
      setIncomeSaving(false);
    }
  };

  const checkStatus = async (txns) => {
    try {
      const resp = await axios.post(`${API_BASE}/check_status`, {
        transactions: txns,
        bank: 'PREPAID'
      });
      if (resp.data.dates) {
        setDateStatus(resp.data.dates);
        setExistingCategories(resp.data.categories || {});
      } else {
        setDateStatus(resp.data);
      }
    } catch (e) {
      console.error('Status check failed', e);
    }
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      const resp = await axios.get(`${API_BASE}/prepaid_transactions`);
      const txns = resp.data.transactions || [];
      setOriginalData(txns);
      const dates = [...new Set(txns.map(t => t.Date))].filter(Boolean);
      setUniqueDates(dates);
      setSelectedDate('');
      setTransactions([]);
      setSyncStatus(null);
      checkStatus(txns);
    } catch (e) {
      console.error('Failed to fetch prepaid transactions', e);
      alert('Failed to fetch transactions');
    } finally {
      setFetching(false);
    }
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setSyncStatus(null);

    const norm = (val) => {
      if (!val) return '0.00';
      const s = String(val).replace(/,/g, '').trim();
      if (!s) return '0.00';
      return parseFloat(s).toFixed(2);
    };

    const filtered = originalData.filter(t => t.Date === date).map(t => {
      const d = (t.Date || '').trim();
      const desc = (t.Description || '').trim();
      const w = norm(t.Withdrawal);
      const dep = norm(t.Deposit);
      const sig = `${d}_${desc}_${w}_${dep}`;
      const prefilledCat = existingCategories[sig] || '';
      return { ...t, Category: t.Category || prefilledCat };
    });

    setTransactions(filtered);
  };

  const handleCategoryChange = (index, category) => {
    const updated = [...transactions];
    updated[index].Category = category;
    setTransactions(updated);
  };

  const handleSync = async () => {
    setSyncStatus('Syncing...');
    try {
      await axios.post(`${API_BASE}/sync`, {
        transactions,
        dates: [selectedDate],
        bank: 'PREPAID'
      });
      setSyncStatus('Success! Transactions synced.');
      checkStatus(originalData);
    } catch (e) {
      console.error('Sync failed', e);
      setSyncStatus('Failed to sync. Check console/backend.');
    }
  };

  return (
    <>
      <section className="card upload-section">
        <h2>1. Fetch Prepaid Transactions</h2>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '15px' }}>
          Loads transactions from your ICICI Prepaid Card email alerts (synced automatically every hour by Apps Script).
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={handleFetch} disabled={fetching} className="btn primary">
            {fetching ? 'Fetching...' : 'Fetch Transactions'}
          </button>
          {originalData.length > 0 && (
            <span style={{ color: '#10b981', fontSize: '0.9rem' }}>
              ✓ {originalData.length} transaction{originalData.length !== 1 ? 's' : ''} loaded
            </span>
          )}
        </div>
      </section>

      {uniqueDates.length > 0 && (
        <section className="card date-section">
          <h2>2. Select Date</h2>
          <div className="date-grid">
            {uniqueDates.map(date => {
              const status = dateStatus[date];
              const statusClass = status === 'green' ? 'status-green' : status === 'red' ? 'status-red' : '';
              return (
                <button
                  key={date}
                  onClick={() => handleDateSelect(date)}
                  className={`btn date-btn ${selectedDate === date ? 'active' : ''} ${statusClass}`}
                >
                  {date}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {transactions.length > 0 && (
        <section className="card transactions-section">
          <div className="section-header">
            <h2>3. Review & Tag ({selectedDate}) <span style={{ fontSize: '0.8em', color: '#666' }}>via Prepaid Card</span></h2>
            <button onClick={handleSync} className="btn success">Sync to Sheet</button>
          </div>
          {syncStatus && (
            <div className={`status-msg ${syncStatus.includes('Success') ? 'success' : 'error'}`}>
              {syncStatus}
            </div>
          )}
          <div className="table-responsive">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={i}>
                    <td className="desc-cell" title={t.Description}>{t.Description}</td>
                    <td className="amount-cell negative">{t.Withdrawal !== '0.00' ? `₹${t.Withdrawal}` : ''}</td>
                    <td className="amount-cell">₹{t.Balance}</td>
                    <td>
                      <select
                        value={t.Category}
                        onChange={(e) => handleCategoryChange(i, e.target.value)}
                        className="category-select"
                      >
                        <option value="">Select...</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Monthly income management */}
      <section className="card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Monthly Prepaid Income</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Default: ₹{fmt(incomeDefault)} credited on 5th of each month
            </p>
          </div>
        </div>

        {incomeMonths.length === 0 ? (
          <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>
            No months found. Fetch transactions first to populate months.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {incomeMonths.map(my => {
                  const eff = effectiveIncome(my);
                  const isOverride = my in incomeOverrides;
                  const isSkipped = isOverride && incomeOverrides[my] === 0;
                  const isEditing = editingIncomeMonth === my;

                  return (
                    <tr key={my}>
                      <td style={{ fontWeight: '600' }}>{my}</td>

                      <td className="amount-cell">
                        {isEditing ? (
                          <input
                            type="number"
                            className="text-input"
                            style={{ width: '120px', padding: '6px' }}
                            value={incomeInput}
                            onChange={e => setIncomeInput(e.target.value)}
                            autoFocus
                          />
                        ) : isSkipped ? (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                        ) : (
                          <span style={{ color: isOverride ? '#8b5cf6' : '#374151', fontWeight: '600' }}>
                            ₹{fmt(eff)}
                          </span>
                        )}
                      </td>

                      <td>
                        {isSkipped ? (
                          <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: '600' }}>Skipped</span>
                        ) : isOverride ? (
                          <span style={{ color: '#8b5cf6', fontSize: '0.8rem', fontWeight: '600' }}>Custom</span>
                        ) : (
                          <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: '600' }}>Default</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn success"
                              style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                              disabled={incomeSaving}
                              onClick={() => handleSaveIncome(my)}
                            >
                              Save
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                              onClick={() => { setEditingIncomeMonth(null); setIncomeInput(''); }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn primary"
                              style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                              onClick={() => { setEditingIncomeMonth(my); setIncomeInput(isSkipped ? incomeDefault : eff); }}
                            >
                              Edit
                            </button>
                            {isOverride ? (
                              <button
                                className="btn"
                                style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                                disabled={incomeSaving}
                                onClick={() => handleDeleteIncome(my)}
                                title="Revert to default"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                className="btn"
                                style={{ padding: '5px 10px', fontSize: '0.8rem', color: '#ef4444' }}
                                disabled={incomeSaving}
                                onClick={() => handleSkipIncome(my)}
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
