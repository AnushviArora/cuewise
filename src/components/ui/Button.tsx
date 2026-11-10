"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "ghost";

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  children: React.ReactNode;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-on font-semibold shadow-glow hover:brightness-110 disabled:shadow-none",
  ghost:
    "bg-white/[0.04] text-ink border border-edge hover:bg-white/[0.09] hover:border-ink/60",
};

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
