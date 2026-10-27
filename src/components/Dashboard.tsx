"use client";
import { useEffect } from "react";
import Markup from "./Markup";
import { mount } from "@/lib/legacy/app";
import { synth } from "@/lib/data/synthetic";
import { loadSeries } from "@/lib/data/provider";

export default function Dashboard() {
  useEffect(() => {
    mount({ synth, load: loadSeries });
  }, []);
  return <Markup />;
}
