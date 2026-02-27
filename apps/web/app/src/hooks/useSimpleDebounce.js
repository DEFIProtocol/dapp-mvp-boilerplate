// components/Admin/hooks/useSimpleDebounce.js
import { useState, useEffect, useRef } from 'react';

export function useSimpleDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    const timeoutRef = useRef(null);

    useEffect(() => {
        timeoutRef.current = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(timeoutRef.current);
    }, [value, delay]);

    return debouncedValue;
}