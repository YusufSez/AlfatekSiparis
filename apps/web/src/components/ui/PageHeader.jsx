export default function PageHeader({ title, description, actions }) {
  return (
    <div className="page-header">
      <div>
        {title && <h1 className="page-header-title">{title}</h1>}
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
