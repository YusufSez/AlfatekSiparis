export default function DataTable({ columns, rows, rowKey = 'id', empty }) {
  if (!rows?.length) return empty || null;

  return (
    <div className="table-wrap">
      <table className="data-table data-table-desktop">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]} className={row._muted ? 'row-muted' : ''}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-card-list" role="list">
        {rows.map((row) => (
          <article
            key={row[rowKey]}
            className={`data-card-item ${row._muted ? 'row-muted' : ''}`}
            role="listitem"
          >
            {columns.map((c) => (
              <div key={c.key} className="data-card-row">
                <span className="data-card-label">{c.header}</span>
                <div className="data-card-value">{c.render ? c.render(row) : row[c.key]}</div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}
