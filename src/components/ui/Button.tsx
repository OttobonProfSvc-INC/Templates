import * as React from "react"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    
    let variantStyles = "bg-primary text-primary-foreground hover:bg-primary/90";
    if (variant === "secondary") variantStyles = "bg-secondary text-secondary-foreground hover:bg-secondary/80";
    if (variant === "outline") variantStyles = "border border-border bg-background hover:bg-slate-100 hover:text-slate-900";
    if (variant === "ghost") variantStyles = "hover:bg-slate-100 hover:text-slate-900";
    if (variant === "danger") variantStyles = "bg-destructive text-destructive-foreground hover:bg-destructive/90";

    let sizeStyles = "h-10 px-4 py-2";
    if (size === "sm") sizeStyles = "h-9 rounded-md px-3";
    if (size === "lg") sizeStyles = "h-11 rounded-md px-8";
    if (size === "icon") sizeStyles = "h-10 w-10";

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 ${variantStyles} ${sizeStyles} ${className}`}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
