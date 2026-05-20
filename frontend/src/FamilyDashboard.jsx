import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const API_BASE = import.meta.env.DEV ? `http://${window.location.hostname}:5000` : '';

const PIE_COLORS = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#a78bfa', '#fb7185',
];

const SOURCE_COLOR = { ICICI: '#0ea5e9', HDFC: '#10b981', PREPAID: '#f59e0b' };
const SOURCE_LABEL = { ICICI: 'Harish (ICICI)', HDFC: 'Jeyashree (HDFC)', PREPAID: 'Prepaid' };

const SPENDING_EXCLUDED = new Set(['not required', 'investment', 'dividend']);

const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FamilyDashboard() {
  const [monthYears, setMonthYears] = useState([]);
  const [selectedMonthYear, setSelectedMonthYear] = useState('');
  const [data, setData] = useState([]);
  const [balances, setBalances] = useState({});
  const [incomeSummary, setIncomeSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchData(''); }, []);

  useEffect(() => {
    if (selectedMonthYear) fetchData(selectedMonthYear);
  }, [selectedMonthYear]);

  const fetchData = async (monthYear) => {
    setLoading(true);
    try {
      const url = `${API_BASE}/family_dashboard_data${monthYear ? `?month_year=${monthYear}` : ''}`;
      const resp = await axios.get(url);
      setMonthYears(resp.data.month_years || []);
      if (!selectedMonthYear && resp.data.selected_month_year) {
        setSelectedMonthYear(resp.data.selected_month_year);
      }
      setData(resp.data.data || []);
      setBalances(resp.data.per_source?.balances || {});
      setIncomeSummary(resp.data.income_summary || null);
    } catch (e) {
      console.error('Failed to fetch family dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  // Derived metrics
  const totalSpending = data.reduce((sum, item) => {
    if (SPENDING_EXCLUDED.has(item.category.toLowerCase())) return sum;
    return sum + item.amount;
  }, 0);

  const perSourceSpending = ['ICICI', 'HDFC', 'PREPAID'].reduce((acc, src) => {
    acc[src] = data.reduce((sum, item) => {
      if (SPENDING_EXCLUDED.has(item.category.toLowerCase())) return sum;
      return sum + (item.breakdown[src] || 0);
    }, 0);
    return acc;
  }, {});

  const pieData = data
    .filter(item => item.amount > 0)
    .map((item, idx) => ({
      name: item.category,
      value: item.amount,
      color: PIE_COLORS[idx % PIE_COLORS.length],
    }));

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0].payload;
    const pct = totalSpending > 0 ? ((value / totalSpending) * 100).toFixed(1) : 0;
    return (
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem' }}>
        <div style={{ fontWeight: '700', textTransform: 'capitalize', marginBottom: '4px' }}>{name}</div>
        <div>₹{fmt(value)}</div>
        <div style={{ color: '#64748b' }}>{pct}% of total</div>
      </div>
    );
  };

  return (
    <div className="dashboard-container card">
      <h2>Family Dashboard</h2>

      {/* Month selector */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ marginRight: '10px', fontWeight: 'bold', color: '#333' }}>Select Month-Year:</label>
        <select
          value={selectedMonthYear}
          onChange={(e) => setSelectedMonthYear(e.target.value)}
          className="text-input"
          style={{ minWidth: '150px' }}
        >
          {monthYears.length === 0 && <option value="">No data available</option>}
          {monthYears.map(my => <option key={my} value={my}>{my}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading data...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: '14px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {['ICICI', 'HDFC', 'PREPAID'].map(src => (
              <div key={src} style={{
                flex: '1', minWidth: '170px',
                background: SOURCE_COLOR[src] + '12',
                border: `1px solid ${SOURCE_COLOR[src]}35`,
                borderRadius: '12px', padding: '16px',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '6px' }}>
                  {SOURCE_LABEL[src]}
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: SOURCE_COLOR[src] }}>
                  {balances[src] != null ? `₹${fmt(balances[src])}` : '—'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>
                  Spent ₹{fmt(perSourceSpending[src] || 0)}
                </div>
              </div>
            ))}
            <div style={{
              flex: '1', minWidth: '170px',
              background: '#1e293b', borderRadius: '12px', padding: '16px',
            }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600', marginBottom: '6px' }}>
                Total Family Spending
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#f1f5f9' }}>
                ₹{fmt(totalSpending)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '6px', fontStyle: 'italic' }}>
                *Excl. Not Required, Investment
              </div>
            </div>
          </div>

          {/* Income summary */}
          {incomeSummary && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Income Overview</h3>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  Income window: 26th prev month → 8th next month
                </span>
              </div>

              {/* Total income */}
              <div style={{ marginBottom: '20px', padding: '14px 18px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '700', color: '#15803d', fontSize: '1rem' }}>Total Income</span>
                <span style={{ fontWeight: '800', color: '#15803d', fontSize: '1.4rem' }}>
                  {incomeSummary.income > 0 ? `₹${fmt(incomeSummary.income)}` : '—'}
                </span>
              </div>

              {/* % breakdown bars */}
              {incomeSummary.income > 0 ? (() => {
                const pctSpent    = Math.min((incomeSummary.spent    / incomeSummary.income) * 100, 100);
                const pctInvested = Math.min((incomeSummary.invested / incomeSummary.income) * 100, 100);
                const pctUnknown  = Math.max(100 - pctSpent - pctInvested, 0);
                const unknown     = incomeSummary.unknown;

                const metrics = [
                  { label: '% Spent',    pct: pctSpent,    amt: incomeSummary.spent,    bar: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
                  { label: '% Invested', pct: pctInvested, amt: incomeSummary.invested, bar: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed' },
                  { label: unknown >= 0 ? '% Remaining' : '% Overspent', pct: Math.abs(100 - pctSpent - pctInvested), amt: Math.abs(unknown), bar: unknown >= 0 ? '#0ea5e9' : '#f97316', bg: unknown >= 0 ? '#f0f9ff' : '#fff7ed', border: unknown >= 0 ? '#bae6fd' : '#fed7aa', text: unknown >= 0 ? '#0284c7' : '#ea580c' },
                ];

                return (
                  <>
                    {/* Stacked bar */}
                    <div style={{ display: 'flex', height: '10px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px', background: '#f1f5f9' }}>
                      <div style={{ width: `${pctSpent}%`,    background: '#ef4444', transition: 'width 0.4s' }} />
                      <div style={{ width: `${pctInvested}%`, background: '#8b5cf6', transition: 'width 0.4s' }} />
                      <div style={{ width: `${pctUnknown}%`,  background: '#0ea5e9', transition: 'width 0.4s' }} />
                    </div>

                    {/* Metric cards */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {metrics.map(m => (
                        <div key={m.label} style={{ flex: '1', minWidth: '140px', padding: '12px 16px', background: m.bg, border: `1px solid ${m.border}`, borderRadius: '10px' }}>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>{m.label}</div>
                          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: m.text }}>{m.pct.toFixed(1)}%</div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>₹{fmt(m.amt)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })() : (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '10px 0', fontStyle: 'italic' }}>
                  No income transactions found for this month's window.<br />
                  Tag salary/income deposits as <strong>income</strong> or <strong>salary</strong> in the Processor.
                </div>
              )}
            </div>
          )}

          {data.length > 0 ? (
            <>
              {/* Donut pie chart */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                  Spending by Category
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                  Combined across ICICI, HDFC and Prepaid
                </p>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={90}
                      outerRadius={140}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Category breakdown table */}
              <div className="table-responsive">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Total</th>
                      <th style={{ color: SOURCE_COLOR.ICICI }}>Harish (ICICI)</th>
                      <th style={{ color: SOURCE_COLOR.HDFC }}>Jeyashree (HDFC)</th>
                      <th style={{ color: SOURCE_COLOR.PREPAID }}>Prepaid</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(item => {
                      const pct = totalSpending > 0 && !SPENDING_EXCLUDED.has(item.category.toLowerCase())
                        ? ((item.amount / totalSpending) * 100).toFixed(1)
                        : null;
                      return (
                        <tr key={item.category}>
                          <td style={{ textTransform: 'capitalize', fontWeight: '500' }}>{item.category}</td>
                          <td className="amount-cell" style={{ fontWeight: 'bold' }}>₹{fmt(item.amount)}</td>
                          <td className="amount-cell" style={{ color: SOURCE_COLOR.ICICI }}>
                            {item.breakdown.ICICI ? `₹${fmt(item.breakdown.ICICI)}` : '—'}
                          </td>
                          <td className="amount-cell" style={{ color: SOURCE_COLOR.HDFC }}>
                            {item.breakdown.HDFC ? `₹${fmt(item.breakdown.HDFC)}` : '—'}
                          </td>
                          <td className="amount-cell" style={{ color: SOURCE_COLOR.PREPAID }}>
                            {item.breakdown.PREPAID ? `₹${fmt(item.breakdown.PREPAID)}` : '—'}
                          </td>
                          <td>
                            {pct ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: '#0ea5e9', borderRadius: '3px' }} />
                                </div>
                                <span style={{ fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>{pct}%</span>
                              </div>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
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
