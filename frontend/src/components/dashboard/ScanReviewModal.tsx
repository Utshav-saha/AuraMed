"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, AlertTriangle, Check, FileText } from "lucide-react";
import Modal from "@/components/Modal";
import { api, type DosageForm, type MedicineVariant, type Prescription, type ScanReview, type Suggestion } from "@/lib/api";
import { isValidDose, joinInstruction, splitInstruction } from "@/lib/dose";

export interface DraftMed {
  key: string;
  medicine_id: number | null;
  name: string; // brand name ba scanned name
  generic_name: string | null;
  strength: string | null;
  dosage_form_id: number | null;
  variants: MedicineVariant[];
  pattern: string;
  meal: string;
  duration_days: number;
  similarity: number | null;
  scanned_name?: string;
}

export interface Draft {
  id: number;
  prescriptionId?: number;
  doctor_name: string;
  doctor_specialization: string;
  disease_diagnosis: string;
  raw_ocr_text: string;
  imageUrl?: string;
  medicines: DraftMed[];
}

let k = 0;
const key = () => `m${++k}`;

export function draftFromScan(s: ScanReview, imageUrl?: string): Draft {
  return {
    id: ++k,
    doctor_name: s.doctor_name ?? "",
    doctor_specialization: s.doctor_specialization ?? "",
    disease_diagnosis: s.disease_diagnosis ?? "",
    raw_ocr_text: s.raw_ocr_text,
    imageUrl,
    medicines: s.medicines.map((m) => {
      const { pattern, meal } = splitInstruction(m.dosage_instruction);
      return {
        key: key(),
        medicine_id: m.medicine_id,
        name: m.brand_name ?? m.scanned_name,
        generic_name: m.generic_name,
        strength: m.strength ?? m.scanned_strength,
        dosage_form_id: m.dosage_form_id,
        variants: m.variants,
        pattern,
        meal,
        duration_days: m.duration_days,
        similarity: m.similarity,
        scanned_name: m.scanned_name,
      };
    }),
  };
}

export function draftFromPrescription(p: Prescription): Draft {
  return {
    id: ++k,
    prescriptionId: p.prescription_id,
    doctor_name: p.doctorName ?? "",
    doctor_specialization: p.specialization ?? "",
    disease_diagnosis: p.disease_diagnosis ?? "",
    raw_ocr_text: p.raw_ocr_text ?? "",
    medicines: p.items.map((it) => {
      const { pattern, meal } = splitInstruction(it.dosage_instruction);
      return {
        key: key(),
        medicine_id: it.medicine_id,
        name: it.brand_name ?? it.medicine_name ?? "",
        generic_name: it.generic_name,
        strength: it.strength,
        dosage_form_id: null,
        variants: [],
        pattern,
        meal,
        duration_days: it.duration,
        similarity: null,
      };
    }),
  };
}

const MEALS = ["", "Before food", "After food", "With food"];

interface Props {
  draft: Draft | null;
  onClose: () => void;
  onSaved: () => void;
}

// notun draft asle key change, form fresh state e start kore
export default function ScanReviewModal(props: Props) {
  return props.draft ? <Editor key={props.draft.id} {...props} draft={props.draft} /> : null;
}

function Editor({ draft, onClose, onSaved }: Props & { draft: Draft }) {
  const [d, setD] = useState<Draft | null>(draft);
  const [forms, setForms] = useState<DosageForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOcr, setShowOcr] = useState(false);

  useEffect(() => {
    api.dosageForms().then(setForms).catch(() => {});
  }, []);

  const problems = useMemo(() => {
    if (!d) return [];
    const p: string[] = [];
    d.medicines.forEach((m, i) => {
      if (!m.name.trim()) p.push(`Row ${i + 1}: medicine name is empty`);
      if (!isValidDose(m.pattern)) p.push(`Row ${i + 1}: dose must look like 1+0+1`);
      if (!(m.duration_days >= 1)) p.push(`Row ${i + 1}: duration must be at least 1 day`);
    });
    if (d.medicines.length === 0) p.push("Add at least one medicine");
    return p;
  }, [d]);

  const patch = (i: number, u: Partial<DraftMed>) =>
    setD((s) => s && { ...s, medicines: s.medicines.map((m, j) => (j === i ? { ...m, ...u } : m)) });

  const pickSuggestion = async (i: number, s: Suggestion) => {
    if (s.kind !== "brand" || !s.medicine_id) {
      patch(i, { medicine_id: null, name: s.label, generic_name: s.kind === "generic" ? s.label : null, variants: [] });
      return;
    }
    const variants = await api.medicineVariants(s.label).catch(() => []);
    const v = variants[0];
    patch(i, {
      medicine_id: v?.medicine_id ?? s.medicine_id,
      name: s.label,
      generic_name: s.sub ?? null,
      strength: v?.strength ?? null,
      dosage_form_id: v?.dosage_form_id ?? null,
      variants,
      similarity: 1,
    });
  };

  const save = async () => {
    if (!d || problems.length) return;
    setBusy(true);
    setErr(null);
    const body = {
      doctor_name: d.doctor_name.trim() || null,
      doctor_specialization: d.doctor_specialization.trim() || null,
      disease_diagnosis: d.disease_diagnosis.trim() || null,
      raw_ocr_text: d.raw_ocr_text || null,
      medicines: d.medicines.map((m) => ({
        medicine_id: m.medicine_id,
        medicine_name: m.medicine_id ? null : m.name.trim(),
        dosage_form_id: m.dosage_form_id,
        dosage_instruction: joinInstruction(m.pattern, m.meal),
        duration_days: m.duration_days,
      })),
    };
    try {
      if (d.prescriptionId) await api.editPrescription(d.prescriptionId, body);
      else await api.savePrescription(body);
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!d) return null;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={d.prescriptionId ? "Edit prescription" : "Review scanned prescription"}
      footer={
        <>
          {problems.length > 0 && (
            <span className="mr-auto text-xs text-amber flex items-center gap-1">
              <AlertTriangle size={13} /> {problems[0]}
            </span>
          )}
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={busy || problems.length > 0} className="btn-primary">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {d.prescriptionId ? "Save changes" : "Save prescription"}
          </button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-5 min-w-0">
          <p className="text-xs text-ink-3">Check everything before saving. OCR can misread handwriting, so fix names and doses here.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label>
              <span className="label">Doctor</span>
              <input value={d.doctor_name} onChange={(e) => setD({ ...d, doctor_name: e.target.value })} className="input" placeholder="Dr. …" />
            </label>
            <label>
              <span className="label">Specialization</span>
              <input value={d.doctor_specialization} onChange={(e) => setD({ ...d, doctor_specialization: e.target.value })} className="input" placeholder="MBBS, FCPS" />
            </label>
            <label>
              <span className="label">Diagnosis</span>
              <input value={d.disease_diagnosis} onChange={(e) => setD({ ...d, disease_diagnosis: e.target.value })} className="input" placeholder="e.g. Migraine" />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Medicines</span>
              <button
                onClick={() =>
                  setD({
                    ...d,
                    medicines: [
                      ...d.medicines,
                      { key: key(), medicine_id: null, name: "", generic_name: null, strength: null, dosage_form_id: null, variants: [], pattern: "1+0+1", meal: "", duration_days: 7, similarity: null },
                    ],
                  })
                }
                className="btn-ghost h-8 text-xs"
              >
                <Plus size={14} /> Add row
              </button>
            </div>
            {d.medicines.map((m, i) => (
              <MedRow key={m.key} m={m} forms={forms} onChange={(u) => patch(i, u)} onPick={(s) => pickSuggestion(i, s)} onRemove={() => setD({ ...d, medicines: d.medicines.filter((_, j) => j !== i) })} />
            ))}
          </div>

          {d.raw_ocr_text && (
            <div>
              <button onClick={() => setShowOcr((v) => !v)} className="text-xs text-ink-2 flex items-center gap-1 hover:text-ink">
                <FileText size={13} /> {showOcr ? "Hide" : "Show"} raw OCR text
              </button>
              {showOcr && <pre className="mt-2 text-[11px] whitespace-pre-wrap bg-paper border border-line rounded-md p-3 max-h-40 overflow-auto font-mono">{d.raw_ocr_text}</pre>}
            </div>
          )}
          {err && <p className="text-rx text-sm">{err}</p>}
        </div>

        {d.imageUrl && (
          <div className="hidden lg:block">
            <span className="label">Scanned image</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.imageUrl} alt="Prescription" className="w-full rounded-md border border-line sticky top-0" />
          </div>
        )}
      </div>
    </Modal>
  );
}

function MedRow({
  m,
  forms,
  onChange,
  onPick,
  onRemove,
}: {
  m: DraftMed;
  forms: DosageForm[];
  onChange: (u: Partial<DraftMed>) => void;
  onPick: (s: Suggestion) => void;
  onRemove: () => void;
}) {
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [focus, setFocus] = useState(false);
  const [typing, setTyping] = useState(false); // user likhche, na suggestion theke pick korse
  const q = m.name;

  // suggest: prefix match, gemini lagena
  useEffect(() => {
    const t = setTimeout(() => {
      if (focus && typing && q.trim().length >= 2) api.suggest(q, 6).then(setSugs).catch(() => setSugs([]));
      else setSugs([]);
    }, 180);
    return () => clearTimeout(t);
  }, [q, focus, typing]);

  const unmatched = !m.medicine_id;
  const badDose = !isValidDose(m.pattern);

  return (
    <div className={`sheet p-3 grid gap-2 ${unmatched ? "border-amber/60" : ""}`}>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
        <div className="relative min-w-0">
          <input
            value={q}
            onChange={(e) => {
              setTyping(true);
              onChange({ name: e.target.value, medicine_id: null, variants: [], similarity: null });
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            placeholder="Medicine name"
            className="input font-medium"
          />
          {sugs.length > 0 && focus && (
            <ul className="absolute z-20 left-0 right-0 mt-1 sheet shadow-lg max-h-48 overflow-auto text-sm">
              {sugs.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      setTyping(false);
                      setSugs([]);
                      onPick(s);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-paper flex justify-between gap-2"
                  >
                    <span>{s.label}</span>
                    <span className="text-xs text-ink-3 truncate">{s.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="text-[11px] mt-1 flex flex-wrap gap-x-2 text-ink-3">
            {m.scanned_name && m.scanned_name !== m.name && <span>scanned as “{m.scanned_name}”</span>}
            {m.generic_name && <span>{m.generic_name}</span>}
            {unmatched ? <span className="text-amber">not linked to database — saved by name only</span> : m.similarity != null && m.similarity < 0.8 ? <span className="text-amber">low confidence match</span> : null}
          </div>
        </div>
        <button onClick={onRemove} className="btn-ghost h-9 w-9 p-0 text-rx" aria-label="Remove">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_0.8fr_1fr_0.6fr] gap-2">
        {m.variants.length > 1 ? (
          <select
            value={m.medicine_id ?? ""}
            onChange={(e) => {
              const v = m.variants.find((x) => x.medicine_id === Number(e.target.value));
              if (v) onChange({ medicine_id: v.medicine_id, strength: v.strength, dosage_form_id: v.dosage_form_id });
            }}
            className="input h-9 text-xs"
          >
            {m.variants.map((v) => (
              <option key={v.medicine_id} value={v.medicine_id}>
                {v.strength ?? "—"} · {v.dosage_form_name ?? "?"}
              </option>
            ))}
          </select>
        ) : (
          <input value={m.strength ?? ""} onChange={(e) => onChange({ strength: e.target.value })} placeholder="Strength" className="input h-9 text-xs" />
        )}
        <select value={m.dosage_form_id ?? ""} onChange={(e) => onChange({ dosage_form_id: e.target.value ? Number(e.target.value) : null })} className="input h-9 text-xs">
          <option value="">Form</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <input
          value={m.pattern}
          onChange={(e) => onChange({ pattern: e.target.value })}
          placeholder="1+0+1"
          className={`input h-9 num text-center ${badDose ? "border-rx" : ""}`}
          title="morning + noon + night"
        />
        <select value={m.meal} onChange={(e) => onChange({ meal: e.target.value })} className="input h-9 text-xs">
          {MEALS.map((x) => (
            <option key={x} value={x}>{x || "Meal —"}</option>
          ))}
        </select>
        <div className="relative">
          <input type="number" min={1} value={m.duration_days} onChange={(e) => onChange({ duration_days: Number(e.target.value) })} className="input h-9 num pr-7" />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-3">d</span>
        </div>
      </div>
    </div>
  );
}
