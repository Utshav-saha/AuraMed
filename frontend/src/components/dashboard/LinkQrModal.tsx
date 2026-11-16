"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { api } from "@/lib/api";

// browser er BarcodeDetector thakle camera, nahole manual id
type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats: string[] }) => Detector;
  }
}

function idFrom(raw: string): number | null {
  const m = raw.match(/(\d+)(?!.*\d)/); // last number in the payload
  return m ? Number(m[1]) : null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
}

// bondho hole unmount, tai state nije thekei reset
export default function LinkQrModal(props: Props) {
  return props.open ? <Inner {...props} /> : null;
}

function Inner({ open, onClose, onLinked }: Props) {
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [camOn, setCamOn] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const supported = typeof window !== "undefined" && !!window.BarcodeDetector;

  const link = async (id: number) => {
    setBusy(true);
    setErr(null);
    try {
      await api.linkPrescription(id);
      onLinked();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !camOn || !supported) return;
    let stop = false;
    const det = new window.BarcodeDetector!({ formats: ["qr_code"] });
    (async () => {
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) {
          video.current.srcObject = stream.current;
          await video.current.play();
        }
        while (!stop) {
          await new Promise((r) => setTimeout(r, 350));
          if (!video.current || video.current.readyState < 2) continue;
          const codes = await det.detect(video.current);
          const id = codes[0] && idFrom(codes[0].rawValue);
          if (id) {
            stop = true;
            void link(id);
          }
        }
      } catch {
        setErr("Camera not available. Enter the prescription ID instead.");
        setCamOn(false);
      }
    })();
    return () => {
      stop = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, camOn, supported]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link a prescription"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => manual && link(Number(manual))} disabled={busy || !manual} className="btn-primary">
            {busy && <Loader2 size={14} className="animate-spin" />} Link
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-2">Your doctor&apos;s clinic can hand you a QR code. Scan it, or type the prescription ID printed under it.</p>
        {supported && (
          <div>
            {camOn ? (
              <video ref={video} className="w-full aspect-square object-cover rounded-md bg-ink" muted playsInline />
            ) : (
              <button onClick={() => setCamOn(true)} className="btn-outline w-full h-24 flex-col gap-1">
                <Camera size={20} />
                <span className="text-xs">Open camera</span>
              </button>
            )}
          </div>
        )}
        <div>
          <span className="label">Prescription ID</span>
          <input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="e.g. 1024" className="input num" />
        </div>
        {err && <p className="text-rx text-xs">{err}</p>}
      </div>
    </Modal>
  );
}
