// utils/sortUtils.js
import { useState } from 'react';

/**
 * Generic sorting function for tables
 * @param {Array} data - The array to sort
 * @param {string} sortField - The field to sort by
 * @param {string} sortDirection - 'asc' or 'desc'
 * @param {Object} options - Additional options for special cases
 * @returns {Array} Sorted array
 */
export const sortData = (data, sortField, sortDirection, options = {}) => {
    if (!data || !data.length) return data;

    return [...data].sort((a, b) => {
        let aVal = getValue(a, sortField, options);
        let bVal = getValue(b, sortField, options);

        // Handle null/undefined values
        if (aVal === null || aVal === undefined) aVal = sortDirection === 'asc' ? Infinity : -Infinity;
        if (bVal === null || bVal === undefined) bVal = sortDirection === 'asc' ? Infinity : -Infinity;

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
};

/**
 * Extract value from item based on field and options
 */
const getValue = (item, field, options) => {
    const { 
        numericFields = [], 
        dateFields = [], 
        defaultValue = '',
        customGetters = {} 
    } = options;

    // Check for custom getter first
    if (customGetters[field]) {
        return customGetters[field](item);
    }

    // Handle nested fields (e.g., 'price.usd')
    const value = field.split('.').reduce((obj, key) => obj?.[key], item);

    // Handle different field types
    if (numericFields.includes(field)) {
        return parseFloat(value) || 0;
    }

    if (dateFields.includes(field)) {
        const date = new Date(value || 0).getTime();
        return isNaN(date) ? 0 : date;
    }

    // Default to string comparison
    return value?.toString().toLowerCase() || defaultValue;
};

/**
 * Hook for managing table sorting state
 */
export const useTableSort = (initialField = 'symbol', initialDirection = 'asc') => {
    const [sortField, setSortField] = useState(initialField);
    const [sortDirection, setSortDirection] = useState(initialDirection);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const getSortIndicator = (field) => {
        if (sortField !== field) return '↕️';
        return sortDirection === 'asc' ? '↑' : '↓';
    };

    return {
        sortField,
        sortDirection,
        handleSort,
        getSortIndicator
    };
};

/**
 * Predefined sort configurations for different table types
 */
export const SORT_CONFIGS = {
    coinranking: {
        numericFields: ['rank', 'price', 'change', 'marketCap', 'volume'],
        defaultField: 'rank',
        defaultDirection: 'asc',
        customGetters: {
            '24hVolume': (item) => parseFloat(item['24hVolume']) || 0,
            'marketCap': (item) => parseFloat(item.marketCap) || 0
        }
    },
    
    coinbase: {
        numericFields: ['price', 'change24h', 'volume24h'],
        defaultField: 'symbol',
        defaultDirection: 'asc'
    },
    
    binance: {
        numericFields: ['price', 'change24h', 'volume', 'high24h', 'low24h'],
        defaultField: 'symbol',
        defaultDirection: 'asc',
        customGetters: {
            'change24h': (item) => parseFloat(item.priceChangePercent || item.change24h) || 0
        }
    },
    
    unified: {
        numericFields: ['price', 'change', 'marketCap', 'volume'],
        defaultField: 'symbol',
        defaultDirection: 'asc',
        customGetters: {
            'change': (item) => parseFloat(item.change24h || item.priceChangePercent || item.change) || 0,
            'volume': (item) => parseFloat(item.volume24h || item.volume) || 0
        }
    },
    
    compare: {
        numericFields: [
            'priceChange', 'binancePrice', 'coinbasePrice', 
            'differencePercentage', 'marketCap'
        ],
        defaultField: 'marketCap',
        defaultDirection: 'desc',
        customGetters: {
            'priceChange': (item) => item.priceChange !== null ? parseFloat(item.priceChange) : -Infinity,
            'binancePrice': (item) => item.binancePrice !== null ? parseFloat(item.binancePrice) : -Infinity,
            'coinbasePrice': (item) => item.coinbasePrice !== null ? parseFloat(item.coinbasePrice) : -Infinity,
            'differencePercentage': (item) => item.differencePercentage ? parseFloat(item.differencePercentage) : -Infinity,
            'marketCap': (item) => item.marketCap !== null ? parseFloat(item.marketCap) : -Infinity,
            'symbol': (item) => item.symbol || '',
            'name': (item) => item.name || ''
        }
    }
};