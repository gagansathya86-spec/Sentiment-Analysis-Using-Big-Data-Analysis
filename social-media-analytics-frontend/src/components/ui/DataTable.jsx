import React from 'react';

const DataTable = ({ columns, data, keyField = 'id', emptyMessage = 'No data available' }) => {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i} style={{ 
                padding: '1rem', 
                backgroundColor: 'var(--sidebar-bg)', 
                color: 'var(--text-muted)',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 500,
                textAlign: col.align || 'left',
                borderBottom: '1px solid var(--border-color)',
                width: col.width || 'auto',
                borderTopLeftRadius: i === 0 ? 'var(--radius-sm)' : 0,
                borderTopRightRadius: i === columns.length - 1 ? 'var(--radius-sm)' : 0,
              }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data && data.length > 0 ? (
            data.map((row) => (
              <tr key={row[keyField]} style={{ transition: 'background-color 0.15s ease' }} className="table-row-hover">
                {columns.map((col, i) => (
                  <td key={i} style={{ 
                    padding: '1rem', 
                    borderBottom: '1px solid var(--border-color)',
                    textAlign: col.align || 'left',
                    verticalAlign: 'top',
                    fontSize: '0.875rem'
                  }}>
                    {col.cell ? col.cell(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <style>{`
        .table-row-hover:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
      `}</style>
    </div>
  );
};

export default DataTable;
