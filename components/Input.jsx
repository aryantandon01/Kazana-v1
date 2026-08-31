import React from 'react';

export default function Input({
  label,
  error,
  fullWidth = true,
  ...props
}) {
  const inputStyle = {
    width: fullWidth ? '100%' : 'auto',
    padding: '8px 12px',
    minHeight: '40px',
    fontSize: 'var(--font-size-base)',
    fontFamily: 'var(--font-family)',
    border: error ? '1px solid var(--color-error)' : '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 'var(--spacing-sm)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 'var(--font-weight-medium)',
    color: 'var(--text-secondary)',
  };

  const renderLabel = () => {
    if (!label) return null;
    if (label.endsWith(' *')) {
      const labelText = label.slice(0, -2);
      return (
        <label style={labelStyle} htmlFor={props.id || props.name}>
          {labelText} <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
      );
    }
    return (
      <label style={labelStyle} htmlFor={props.id || props.name}>
        {label}
      </label>
    );
  };

  return (
    <div style={{ marginBottom: label ? 'var(--spacing-lg)' : 0 }}>
      {renderLabel()}
      <input
        style={inputStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--color-error)' : 'var(--color-primary)';
          e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'var(--color-error-bg)' : 'var(--color-primary-muted)'}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--color-error)' : 'var(--border-color)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        {...props}
      />
      {error && (
        <div
          style={{
            marginTop: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
