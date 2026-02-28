import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const API_BASE = import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '';

export default function Dashboard({ bank }) {
  const [monthYears, setMonthYears] = useState([]);
  const [selectedMonthYear, setSelectedMonthYear] = useState('');
  const [data, setData] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  // Budget editing state
  const [editingCategory, setEditingCategory] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');

  // Graph category toggles
  const [hiddenCategories, setHiddenCategories] = useState(new Set(['not required', 'Not Required', 'not Required']));

  // Expanded transaction state
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    // Reset selection when bank changes to fetch default
    setSelectedMonthYear('');
    fetchDashboardData('');
  }, [bank]);

  useEffect(() => {
    if (selectedMonthYear) {
      fetchDashboardData(selectedMonthYear);
    }
  }, [selectedMonthYear]);

  const fetchDashboardData = async (monthYear) => {
    setLoading(true);
    try {
      const url = `${API_BASE}/dashboard_data?bank=${bank}${monthYear ? `&month_year=${monthYear}` : ''}`;
      const resp = await axios.get(url);
      setMonthYears(resp.data.month_years || []);
      if (!selectedMonthYear && resp.data.selected_month_year) {
        setSelectedMonthYear(resp.data.selected_month_year);
      }
      setData(resp.data.data || []);
      setBalance(resp.data.balance);
    } catch (e) {
      console.error('Failed to fetch dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetSubmit = async (category) => {
    if (!budgetInput.trim()) return;
    try {
      await axios.post(`${API_BASE}/budget`, {
        bank,
        month_year: selectedMonthYear,
        category,
        amount: parseFloat(budgetInput)
      });
      setEditingCategory(null);
      setBudgetInput('');
      fetchDashboardData(selectedMonthYear); // refresh
    } catch (e) {
      console.error('Failed to save budget', e);
      alert('Failed to save budget');
    }
  };

  const chartData = data.map(item => ({
    name: item.category,
    Actual: item.amount || 0,
    Budget: item.budget || 0
  }));

  // Helper to check if it's over budget
  const getStatusColor = (actual, budget) => {
    if (!budget) return 'inherit'; // If no budget, no specific color
    return actual > budget ? '#ef4444' : '#10b981'; // red if over, green if within
  };

  const toggleCategoryVisibility = (category) => {
    setHiddenCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const toggleExpand = (category) => {
    if (expandedCategory === category) {
      setExpandedCategory(null);
    } else {
      setExpandedCategory(category);
      setCurrentPage(1); // Reset to page 1 when expanding
    }
  };

  // Filter chart data based on toggled categories
  const visibleChartData = chartData.filter(item => !hiddenCategories.has(item.name));

  // Compute aggregated metrics
  const monthlyCommitmentExcluded = new Set(['not required', 'dividend', 'investment']);
  const currentSpendingsExcluded = new Set(['not required', 'investment']);

  const monthlyCommitment = data.reduce((sum, item) => {
    const catName = item.category.toLowerCase();
    if (!monthlyCommitmentExcluded.has(catName) && item.budget) {
      return sum + item.budget;
    }
    return sum;
  }, 0);

  const currentSpendings = data.reduce((sum, item) => {
    const catName = item.category.toLowerCase();
    if (!currentSpendingsExcluded.has(catName) && item.amount) {
      return sum + item.amount;
    }
    return sum;
  }, 0);


  return (
    <div className="dashboard-container card">
      <h2>{bank} Dashboard</h2>

      <div className="dashboard-controls" style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ marginRight: '10px', fontWeight: 'bold', color: '#333' }}>Select Month-Year:</label>
          <select 
            value={selectedMonthYear} 
            onChange={(e) => setSelectedMonthYear(e.target.value)}
            className="text-input"
            style={{ minWidth: '150px' }}
          >
            {monthYears.length === 0 && <option value="">No data available</option>}
            {monthYears.map(my => (
              <option key={my} value={my}>{my}</option>
            ))}
          </select>
        </div>

        {balance !== null && balance !== undefined && (
          <div className="metrics-display" style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '350px' }}>
            <div className="metric-box" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold', padding: '10px', background: '#e0f2fe', borderRadius: '8px' }}>
              <span>Current Balance:</span> <span style={{ color: '#0284c7' }}>₹{balance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            
            <div className="metric-box" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: '600' }}>
                <span>Monthly Commitment:</span> <span style={{ color: '#475569' }}>₹{monthlyCommitment.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>*Excludes: Not Required, Dividend, Investment</span>
            </div>
            
            <div className="metric-box" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 'bold' }}>
                <span>Current Spendings:</span> <span style={{ color: '#dc2626' }}>₹{currentSpendings.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#ef4444', fontStyle: 'italic', opacity: 0.8 }}>*Excludes: Not Required, Investment</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading data...</div>
      ) : (
        <>
          {data.length > 0 ? (
            <>
              <div className="chart-container" style={{ width: '100%', height: '400px', marginBottom: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visibleChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value) => `₹${value}`} cursor={{fill: '#f1f5f9'}} />
                    <Legend iconType="circle" />
                    <Bar dataKey="Actual" fill="#0ea5e9" name="Actual Spending" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Budget" fill="#cbd5e1" name="Budget Limit" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ marginBottom: '40px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#64748b' }}>Show in Chart:</span>
                {data.map(item => (
                  <label key={item.category} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', cursor: 'pointer', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <input 
                      type="checkbox" 
                      checked={!hiddenCategories.has(item.category)}
                      onChange={() => toggleCategoryVisibility(item.category)}
                    />
                    <span style={{ textTransform: 'capitalize' }}>{item.category}</span>
                  </label>
                ))}
              </div>

              <div className="table-responsive">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Total Amount (Actual)</th>
                      <th>Budget</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(item => (
                      <React.Fragment key={item.category}>
                        <tr style={{ background: expandedCategory === item.category ? '#f8fafc' : 'white' }}>
                          <td style={{ textTransform: 'capitalize', fontWeight: '500' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <button 
                                onClick={() => toggleExpand(item.category)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px', color: '#64748b' }}
                                title="Toggle Transactions"
                              >
                                {expandedCategory === item.category ? '▼' : '▶'}
                              </button>
                              {item.category}
                            </div>
                          </td>
                          <td className="amount-cell" style={{ color: getStatusColor(item.amount, item.budget), fontWeight: 'bold' }}>
                            ₹{item.amount.toFixed(2)}
                          </td>
                          <td>
                            {editingCategory === item.category ? (
                              <input
                                type="number"
                                className="text-input"
                                style={{ width: '120px', padding: '6px' }}
                                value={budgetInput}
                                onChange={(e) => setBudgetInput(e.target.value)}
                                placeholder="Amount"
                                autoFocus
                              />
                            ) : (
                              item.budget ? <span style={{ color: '#475569' }}>₹{item.budget.toFixed(2)}</span> : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not Set</span>
                            )}
                          </td>
                          <td>
                            {item.budget ? (
                              item.amount > item.budget ? (
                                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Over Budget (₹{(item.amount - item.budget).toFixed(2)})</span>
                              ) : (
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>Within Budget</span>
                              )
                            ) : '-'}
                          </td>
                          <td>
                            {editingCategory === item.category ? (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn success" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleBudgetSubmit(item.category)}>Save</button>
                                <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setEditingCategory(null); setBudgetInput(''); }}>Cancel</button>
                              </div>
                            ) : (
                              <button 
                                className="btn primary" 
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }} 
                                onClick={() => {
                                  setEditingCategory(item.category);
                                  setBudgetInput(item.budget ? item.budget : '');
                                }}
                              >
                                Set Budget
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedCategory === item.category && item.transactions && item.transactions.length > 0 && (
                          <tr>
                            <td colSpan="5" style={{ padding: 0 }}>
                              <div style={{ padding: '15px 40px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#475569' }}>Top Transactions Summary</h4>
                                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', background: 'white', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                  <thead>
                                    <tr style={{ background: '#e2e8f0', textAlign: 'left' }}>
                                      <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Date</th>
                                      <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1' }}>Description</th>
                                      <th style={{ padding: '8px', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.transactions
                                      .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                                      .map((tx, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '8px' }}>{tx.date}</td>
                                          <td style={{ padding: '8px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tx.description}>{tx.description}</td>
                                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: '500' }}>₹{tx.amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                  </tbody>
                                </table>
                                
                                {/* Pagination Controls */}
                                {item.transactions.length > ITEMS_PER_PAGE && (
                                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '10px', gap: '15px' }}>
                                    <button 
                                      className="btn" 
                                      disabled={currentPage === 1}
                                      onClick={() => setCurrentPage(prev => prev - 1)}
                                      style={{ padding: '4px 10px', fontSize: '0.8rem', background: currentPage === 1 ? '#e2e8f0' : 'white', border: '1px solid #cbd5e1' }}
                                    >
                                      ← Prev
                                    </button>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                      Page {currentPage} of {Math.ceil(item.transactions.length / ITEMS_PER_PAGE)}
                                    </span>
                                    <button 
                                      className="btn" 
                                      disabled={currentPage >= Math.ceil(item.transactions.length / ITEMS_PER_PAGE)}
                                      onClick={() => setCurrentPage(prev => prev + 1)}
                                      style={{ padding: '4px 10px', fontSize: '0.8rem', background: currentPage >= Math.ceil(item.transactions.length / ITEMS_PER_PAGE) ? '#e2e8f0' : 'white', border: '1px solid #cbd5e1' }}
                                    >
                                      Next →
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {expandedCategory === item.category && (!item.transactions || item.transactions.length === 0) && (
                          <tr>
                            <td colSpan="5">
                              <div style={{ padding: '15px 40px', background: '#f8fafc', color: '#94a3b8', fontStyle: 'italic' }}>
                                No expenses logged for this category in the selected month.
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              No transactions found for this month.
            </div>
          )}
        </>
      )}
    </div>
  );
}
