/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "agentrail-onboarding-done";

interface TourStep {
  selector: string | null;
  title: string;
  description: string;
  placement: "right" | "left" | "bottom" | "center";
}

const STEPS: TourStep[] = [
  {
    selector: null,
    title: "Welcome to Agentrail Playground",
    description:
      "This is a demo app built on Agentrail, showcasing streaming conversations, tool calls, memory, skills, and multi-agent orchestration. Click Next to start the tour.",
    placement: "center",
  },
  {
    selector: ".session-sidebar",
    title: "Session List",
    description:
      "The left sidebar manages all your conversations. Click the + button at the top to create a new session, click an existing one to switch, and hover to reveal the delete button.",
    placement: "right",
  },
  {
    selector: ".clear-btn",
    title: "New Chat",
    description: "Click the New button to quickly start a fresh conversation. Your current session stays in the left sidebar.",
    placement: "bottom",
  },
  {
    selector: ".input-bar",
    title: "Message Input",
    description:
      "Type your question or instruction here. You can drag and drop or click the attachment button to upload files (Excel, Word, images, etc.). Press Enter or click Send.",
    placement: "bottom",
  },
  {
    selector: ".workspace-toggle-btn",
    title: "Workspace Panel",
    description:
      "Toggle the Agent Workspace panel on the right to watch tool steps, file changes, and browser screenshots in real time.",
    placement: "bottom",
  },
  {
    selector: ".workspace-panel",
    title: "Agent Workspace",
    description:
      "This panel shows every tool call the AI makes while answering. Click any row to expand it and inspect the full inputs and outputs, including file trees and browser previews.",
    placement: "left",
  },
  {
    selector: ".settings-gear-btn",
    title: "Identity Settings",
    description:
      "Click this gear icon to open settings and change your Tenant ID or User ID to switch between different data tenants or user identities.",
    placement: "bottom",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function computeTooltipPosition(
  rect: TargetRect,
  placement: TourStep["placement"],
  tooltipW: number,
  tooltipH: number,
  vpW: number,
  vpH: number,
): { top: number; left: number; actualPlacement: TourStep["placement"] } {
  const GAP = 16;
  let top = 0;
  let left = 0;
  let actualPlacement = placement;

  if (placement === "center" || !rect) {
    return {
      top: (vpH - tooltipH) / 2,
      left: (vpW - tooltipW) / 2,
      actualPlacement: "center",
    };
  }

  if (placement === "right") {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left + rect.width + GAP;
    if (left + tooltipW > vpW - 8) {
      left = rect.left - tooltipW - GAP;
      actualPlacement = "left";
    }
  } else if (placement === "left") {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left - tooltipW - GAP;
    if (left < 8) {
      left = rect.left + rect.width + GAP;
      actualPlacement = "right";
    }
  } else if (placement === "bottom") {
    top = rect.top + rect.height + GAP;
    left = rect.left + rect.width / 2 - tooltipW / 2;
    if (top + tooltipH > vpH - 8) {
      top = rect.top - tooltipH - GAP;
    }
  }

  top = Math.max(8, Math.min(top, vpH - tooltipH - 8));
  left = Math.max(8, Math.min(left, vpW - tooltipW - 8));

  return { top, left, actualPlacement };
}

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = STEPS[step]!;
  const total = STEPS.length;

  const measureTarget = useCallback(() => {
    const sel = currentStep.selector;
    if (!sel) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(sel);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [currentStep.selector]);

  useEffect(() => {
    measureTarget();
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, [measureTarget]);

  // Fade in on mount
  useEffect(() => {
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, [step]);

  const finish = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    onDone();
  }, [onDone]);

  const next = useCallback(() => {
    if (step < total - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, total, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const TOOLTIP_W = Math.min(320, Math.max(280, vpW - 24));
  const TOOLTIP_H = 180;

  const PADDING = 12;
  const spotRect = targetRect
    ? {
        top: targetRect.top - PADDING,
        left: targetRect.left - PADDING,
        width: targetRect.width + PADDING * 2,
        height: targetRect.height + PADDING * 2,
      }
    : null;

  const { top: ttTop, left: ttLeft } = computeTooltipPosition(
    targetRect ?? { top: 0, left: 0, width: 0, height: 0 },
    currentStep.placement,
    TOOLTIP_W,
    TOOLTIP_H,
    vpW,
    vpH,
  );

  return (
    <div className="onboarding-root" aria-modal="true" role="dialog" aria-label="Feature tour">
      {/* Dark overlay — only shows solid background when no spotlight (center step) */}
      <div
        className={`onboarding-overlay${!spotRect ? " no-target" : ""}`}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight cutout — box-shadow provides the darkening; transparent bg reveals element */}
      {spotRect && (
        <div
          className="onboarding-spotlight"
          style={{
            top: spotRect.top,
            left: spotRect.left,
            width: spotRect.width,
            height: spotRect.height,
          }}
        />
      )}

      {/* Tooltip bubble */}
      <div
        ref={tooltipRef}
        className={`onboarding-tooltip${visible ? " visible" : ""}`}
        style={{ top: ttTop, left: ttLeft, width: TOOLTIP_W }}
      >
        <div className="onboarding-step-badge">
          {step + 1} / {total}
        </div>
        <h3 className="onboarding-title">{currentStep.title}</h3>
        <p className="onboarding-desc">{currentStep.description}</p>
        <div className="onboarding-actions">
          <button className="onboarding-skip" onClick={finish}>
            Skip
          </button>
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="onboarding-btn-prev" onClick={prev}>
                Back
              </button>
            )}
            <button className="onboarding-btn-next" onClick={next}>
              {step === total - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
        {/* Step dots */}
        <div className="onboarding-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`onboarding-dot${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function shouldShowTour(): boolean {
  return !localStorage.getItem(STORAGE_KEY);
}
