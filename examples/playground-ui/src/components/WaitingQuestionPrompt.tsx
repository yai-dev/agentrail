/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 The Agentrail Authors
 */

import { respondToQuestion } from "../api";

export interface WaitingQuestionState {
  toolCallId: string;
  question: string;
  hint?: string;
  options?: string[];
  multiple?: boolean;
  custom?: boolean;
}

interface WaitingQuestionPromptProps {
  sessionId: string | null;
  waitingQuestion: WaitingQuestionState | null;
  questionInput: string;
  selectedOptions: string[];
  onQuestionInputChange: (value: string) => void;
  onSelectedOptionsChange: (value: string[]) => void;
  onDismiss: () => void;
}

export function WaitingQuestionPrompt({
  sessionId,
  waitingQuestion,
  questionInput,
  selectedOptions,
  onQuestionInputChange,
  onSelectedOptionsChange,
  onDismiss,
}: WaitingQuestionPromptProps) {
  if (!waitingQuestion) {
    return null;
  }

  const { question, hint, options, multiple = false, custom = true } = waitingQuestion;
  const hasOptions = Boolean(options?.length);

  const clearPrompt = () => {
    onDismiss();
    onQuestionInputChange("");
    onSelectedOptionsChange([]);
  };

  const submitAnswer = (answer: string) => {
    if (!answer.trim() || !sessionId) {
      return;
    }

    clearPrompt();
    void respondToQuestion(sessionId, answer.trim());
  };

  const toggleOption = (option: string) => {
    onSelectedOptionsChange(
      selectedOptions.includes(option)
        ? selectedOptions.filter((item) => item !== option)
        : [...selectedOptions, option],
    );
  };

  const confirmMultiple = () => {
    const parts = [...selectedOptions];
    if (questionInput.trim()) {
      parts.push(questionInput.trim());
    }
    if (parts.length === 0) {
      return;
    }
    submitAnswer(parts.join(", "));
  };

  return (
    <div className="waiting-question-bar">
      <div className="waiting-question-content">
        <span className="waiting-question-icon">?</span>
        <div className="waiting-question-text">
          <p className="waiting-question-label">{question}</p>
          {hint && !hasOptions && <p className="waiting-question-hint">{hint}</p>}
          {multiple && hasOptions && (
            <p className="waiting-question-hint">可多选，选完后点击确认</p>
          )}
        </div>
      </div>

      {hasOptions ? (
        <>
          <div className="waiting-question-options">
            {options!.map((option) =>
              multiple ? (
                <button
                  key={option}
                  className={`waiting-question-option-btn${selectedOptions.includes(option) ? " selected" : ""}`}
                  onClick={() => toggleOption(option)}
                >
                  {selectedOptions.includes(option) && <span className="wq-check">✓ </span>}
                  {option}
                </button>
              ) : (
                <button
                  key={option}
                  className="waiting-question-option-btn"
                  onClick={() => submitAnswer(option)}
                >
                  {option}
                </button>
              ),
            )}
          </div>

          {(custom || multiple) && (
            <div className="waiting-question-input-row">
              <input
                className="waiting-question-input"
                type="text"
                placeholder={multiple ? "或输入自定义选项…" : "或输入自定义答案…"}
                value={questionInput}
                onChange={(event) => onQuestionInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }

                  if (multiple) {
                    confirmMultiple();
                    return;
                  }

                  if (questionInput.trim()) {
                    submitAnswer(questionInput);
                  }
                }}
              />
              {multiple ? (
                <button
                  className="waiting-question-submit"
                  disabled={selectedOptions.length === 0 && !questionInput.trim()}
                  onClick={confirmMultiple}
                >
                  确认 {selectedOptions.length > 0 ? `(${selectedOptions.length})` : ""}
                </button>
              ) : (
                <button
                  className="waiting-question-submit"
                  disabled={!questionInput.trim()}
                  onClick={() => submitAnswer(questionInput)}
                >
                  回复
                </button>
              )}
            </div>
          )}

          {multiple && !custom && selectedOptions.length > 0 && (
            <div className="waiting-question-input-row">
              <button
                className="waiting-question-submit"
                style={{ marginLeft: "auto" }}
                onClick={confirmMultiple}
              >
                确认 ({selectedOptions.length})
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="waiting-question-input-row">
          <input
            className="waiting-question-input"
            type="text"
            placeholder="输入你的答案…"
            value={questionInput}
            onChange={(event) => onQuestionInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && questionInput.trim()) {
                submitAnswer(questionInput);
              }
            }}
            autoFocus
          />
          <button
            className="waiting-question-submit"
            disabled={!questionInput.trim()}
            onClick={() => submitAnswer(questionInput)}
          >
            回复
          </button>
        </div>
      )}
    </div>
  );
}
