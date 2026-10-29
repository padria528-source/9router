"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import UsageStats from "@/shared/components/UsageStats";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
  { value: "all", label: "All" },
];

const VALID_PERIODS = new Set(PERIODS.map((p) => p.value));
const DEFAULT_PERIOD = "60d";

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const periodParam = searchParams.get("period");
  const period = periodParam && VALID_PERIODS.has(periodParam)
    ? periodParam
    : DEFAULT_PERIOD;

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  // Keep URL search parameters consistent so refresh preserves the chosen period
  useEffect(() => {
    if (!periodParam || !VALID_PERIODS.has(periodParam)) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("period", DEFAULT_PERIOD);
      router.replace(`/dashboard/usage?${params.toString()}`, { scroll: false });
    }
  }, [periodParam, searchParams, router]);

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    if (!params.has("period")) {
      params.set("period", period);
    }
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handlePeriodChange = (value) => {
    if (value === period) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + period selector on same row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        {activeTab === "overview" && (
          <SegmentedControl
            options={PERIODS}
            value={period}
            onChange={handlePeriodChange}
            size="sm"
            className="w-full sm:w-auto"
          />
        )}
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={handlePeriodChange} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
