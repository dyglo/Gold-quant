"use client";
import { useEffect } from 'react';
import Markup from './Markup';
import { mount } from '@/lib/legacy/app';
import { loadSeries, loadQuote, loadIntraday } from '@/lib/data/provider';
export default function Dashboard() {
  useEffect(() => mount({ load: loadSeries, quote: loadQuote, intraday: loadIntraday }), []);
  return <Markup />;
}
