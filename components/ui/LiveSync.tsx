"use client";

/**
 * LiveSync — Supabase Realtime Subscription Component
 *
 * Mounts once in Providers and listens to postgres_changes on `patients`,
 * `treatments`, and `injections` tables.
 *
 * Performance Optimizations:
 *  1. Directly updates TanStack React Query cache in-memory for zero-latency UI sync.
 *  2. Eliminates full-database reload cascades (no redundant 6-request loops on changes).
 *  3. Targeted invalidation only if payload is partial.
 *  4. Clean channel cleanup on component unmount.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { mapRowToPatient } from "@/lib/dataService";
import { PatientRecord, TreatmentRecord, InjectionItem } from "@/data/mockData";

export const DB_CHANGE_EVENT = "umeed:db-change" as const;

export type DbChangePayload = {
  table: "patients" | "treatments" | "injections";
  eventType: "INSERT" | "UPDATE" | "DELETE";
};

function dispatchDbChange(payload: DbChangePayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DB_CHANGE_EVENT, { detail: payload }));
}

export default function LiveSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel("umeed-hospital-live")

      // ── Patients Realtime Handler ──────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patients" },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const mapped = mapRowToPatient(payload.new);
            queryClient.setQueryData<PatientRecord[]>(
              queryKeys.patients.all,
              (old = []) => [
                mapped,
                ...old.filter((p) => p.patient_id !== mapped.patient_id),
              ]
            );
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const mapped = mapRowToPatient(payload.new);
            queryClient.setQueryData<PatientRecord[]>(
              queryKeys.patients.all,
              (old = []) =>
                old.map((p) => (p.patient_id === mapped.patient_id ? mapped : p))
            );
          } else if (payload.eventType === "DELETE" && payload.old) {
            const deletedId = (payload.old as any).patient_id;
            queryClient.setQueryData<PatientRecord[]>(
              queryKeys.patients.all,
              (old = []) => old.filter((p) => p.patient_id !== deletedId)
            );
          } else {
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
          }

          dispatchDbChange({
            table: "patients",
            eventType: payload.eventType as DbChangePayload["eventType"],
          });
        }
      )

      // ── Treatments Realtime Handler ────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "treatments" },
        (payload) => {
          if (payload.eventType === "DELETE" && payload.old) {
            const deletedId = (payload.old as any).id;
            queryClient.setQueryData<TreatmentRecord[]>(
              queryKeys.treatments.all,
              (old = []) => old.filter((t) => t.id !== deletedId)
            );
          } else {
            // Treatments join with patients & injections; invalidate targeted key
            queryClient.invalidateQueries({ queryKey: queryKeys.treatments.all });
          }

          dispatchDbChange({
            table: "treatments",
            eventType: payload.eventType as DbChangePayload["eventType"],
          });
        }
      )

      // ── Injections Realtime Handler ────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "injections" },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const newInj = payload.new as any;
            const item: InjectionItem = {
              id: Number(newInj.id),
              name: newInj.name,
              type: newInj.type || "Factor",
              strength: newInj.strength || "",
              is_active: newInj.is_active ?? true,
            };
            queryClient.setQueryData<InjectionItem[]>(
              queryKeys.injections.all,
              (old = []) => [
                ...old.filter((i) => i.id !== item.id),
                item,
              ]
            );
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const updated = payload.new as any;
            queryClient.setQueryData<InjectionItem[]>(
              queryKeys.injections.all,
              (old = []) =>
                old.map((i) =>
                  i.id === Number(updated.id)
                    ? {
                        ...i,
                        name: updated.name,
                        type: updated.type || i.type,
                        strength: updated.strength || i.strength,
                        is_active: updated.is_active ?? i.is_active,
                      }
                    : i
                )
            );
          } else {
            queryClient.invalidateQueries({ queryKey: queryKeys.injections.all });
          }

          dispatchDbChange({
            table: "injections",
            eventType: payload.eventType as DbChangePayload["eventType"],
          });
        }
      )

      .subscribe((status) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[LiveSync] Realtime channel status:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
