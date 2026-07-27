export default function Button({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const variantClass =
    variant === 'ghost'
      ? 'ghost'
      : variant === 'danger'
        ? 'danger'
        : variant === 'danger-ghost'
          ? 'danger-ghost'
          : variant === 'success-ghost'
            ? 'success-ghost'
            : 'primary';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${loading ? 'is-loading' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? loadingText || 'İşleniyor…' : children}
    </button>
  );
}
