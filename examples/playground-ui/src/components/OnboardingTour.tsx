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
    title: "欢迎使用 Agentrail Playground",
    description:
      "这是一个基于 Agentrail 的示例应用，演示流式对话、工具调用、记忆、技能与多 Agent 编排。点击「下一步」开始功能引导。",
    placement: "center",
  },
  {
    selector: ".session-sidebar",
    title: "会话列表",
    description:
      "左侧边栏管理你的所有对话。点击顶部 + 按钮创建新会话，点击已有会话切换，悬停后可删除。",
    placement: "right",
  },
  {
    selector: ".clear-btn",
    title: "新建对话",
    description: "点击「New」按钮快速开始一次全新对话，当前会话会保留在左侧列表中。",
    placement: "bottom",
  },
  {
    selector: ".input-bar",
    title: "消息输入区",
    description:
      "在此输入你的问题或指令。支持拖拽或点击附件按钮上传文件（Excel、Word、图片等），按 Enter 或点击发送。",
    placement: "bottom",
  },
  {
    selector: ".workspace-toggle-btn",
    title: "工作区面板",
    description:
      "点击此按钮切换右侧「Agent 工作区」面板，可实时查看 AI 调用的工具步骤、文件变更和浏览器截图。",
    placement: "bottom",
  },
  {
    selector: ".workspace-panel",
    title: "Agent 工作区",
    description:
      "这里展示 AI 每次回答时调用的所有工具操作。点击每一行可展开查看详细的输入与输出，包含文件树和浏览器预览。",
    placement: "left",
  },
  {
    selector: ".settings-gear-btn",
    title: "身份设置",
    description:
      "点击此齿轮图标打开设置，可修改当前的 Tenant ID 和 User ID，切换不同的数据租户或用户身份。",
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
  const TOOLTIP_W = 320;
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
    <div className="onboarding-root" aria-modal="true" role="dialog" aria-label="功能引导">
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
            跳过
          </button>
          <div className="onboarding-nav">
            {step > 0 && (
              <button className="onboarding-btn-prev" onClick={prev}>
                上一步
              </button>
            )}
            <button className="onboarding-btn-next" onClick={next}>
              {step === total - 1 ? "完成" : "下一步"}
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
              aria-label={`跳转到第 ${i + 1} 步`}
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
