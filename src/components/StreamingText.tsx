import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';

interface StreamingTextProps {
  text: string;
  isActive: boolean;
  className?: string;
}

function isCJK(text: string): boolean {
  return /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(text);
}

export default function StreamingText({ text, isActive, className = '' }: StreamingTextProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const prevTextRef = useRef('');

  const tokens = useMemo(() => {
    if (isCJK(text)) return [...text];
    return text.split(/(\s+)/).filter(Boolean);
  }, [text]);

  useEffect(() => {
    if (text !== prevTextRef.current) {
      prevTextRef.current = text;
    }
  }, [text]);

  useEffect(() => {
    if (!isActive && text) {
      setVisibleCount(tokens.length);
      return;
    }

    if (visibleCount < tokens.length) {
      const timer = setTimeout(() => setVisibleCount((v) => v + 1), 55);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, tokens.length, isActive, text]);

  useEffect(() => {
    setVisibleCount(0);
    prevTextRef.current = '';
  }, []);

  return (
    <span className={className}>
      {tokens.map((token, i) => (
        <motion.span
          key={`${i}-${token}`}
          initial={i >= visibleCount ? { opacity: 0, filter: 'blur(3px)' } : false}
          animate={{
            opacity: i < visibleCount ? 1 : 0,
            filter: i < visibleCount ? 'blur(0px)' : 'blur(3px)',
          }}
          transition={{ duration: 0.12 }}
          className="inline-block"
        >
          {token}
        </motion.span>
      ))}
      {isActive && text && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.55, repeat: Infinity }}
          className="inline-block w-[2px] h-[1.1em] bg-amber-500 ml-[2px] align-text-bottom rounded-full"
        />
      )}
    </span>
  );
}
