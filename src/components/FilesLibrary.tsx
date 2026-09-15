"use client";

import {
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Lock,
  MessageCircleQuestion,
  Send,
  Trash2,
  Upload
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import type { FileQuestion, SharedFile, User } from "@/lib/types";

export function FilesLibrary({ currentUser }: { currentUser: User }) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const [questionsByFile, setQuestionsByFile] = useState<Record<string, FileQuestion[]>>({});
  const [draftByFile, setDraftByFile] = useState<Record<string, string>>({});
  const [askingFileId, setAskingFileId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    const response = await fetch("/api/files", { cache: "no-store" });
    if (response.status === 423) {
      setIsLocked(true);
    } else if (response.ok) {
      const body = (await response.json()) as { files: SharedFile[] };
      setFiles(body.files);
      setIsLocked(false);
    }
    setIsLoading(false);
  }, []);

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsUnlocking(true);
    setUnlockError("");
    const response = await fetch("/api/files/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: accessCode })
    });
    const body = await response.json();
    setIsUnlocking(false);

    if (!response.ok) {
      setUnlockError(body.error ?? "קוד הגישה שגוי.");
      return;
    }

    setAccessCode("");
    setIsLocked(false);
    await loadFiles();
  }

  useEffect(() => {
    // Initial data fetching is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFiles();
  }, [loadFiles]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!(formData.get("file") instanceof File) || (formData.get("file") as File).size === 0) {
      setToast("יש לבחור קובץ להעלאה.");
      return;
    }

    setIsUploading(true);
    const response = await fetch("/api/files", { method: "POST", body: formData });
    const body = await response.json();
    setIsUploading(false);

    if (!response.ok) {
      if (response.status === 423) {
        setIsLocked(true);
      }
      setToast(body.error ?? "העלאת הקובץ נכשלה.");
      return;
    }

    formRef.current?.reset();
    setToast("הקובץ הועלה בהצלחה.");
    await loadFiles();
  }

  async function handleDelete(file: SharedFile) {
    const response = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      if (response.status === 423) {
        setIsLocked(true);
      }
      setToast(body.error ?? "מחיקת הקובץ נכשלה.");
      return;
    }
    setToast("הקובץ נמחק.");
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  async function toggleQuestions(fileId: string) {
    if (expandedFileId === fileId) {
      setExpandedFileId(null);
      return;
    }
    setExpandedFileId(fileId);
    if (!questionsByFile[fileId]) {
      const response = await fetch(`/api/files/${fileId}/questions`, { cache: "no-store" });
      if (response.status === 423) {
        setIsLocked(true);
      } else if (response.ok) {
        const body = (await response.json()) as { questions: FileQuestion[] };
        setQuestionsByFile((current) => ({ ...current, [fileId]: body.questions }));
      }
    }
  }

  async function handleAsk(fileId: string) {
    const question = (draftByFile[fileId] ?? "").trim();
    if (!question || askingFileId) {
      return;
    }

    setAskingFileId(fileId);
    const response = await fetch(`/api/files/${fileId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const body = await response.json();
    setAskingFileId(null);

    if (!response.ok) {
      if (response.status === 423) {
        setIsLocked(true);
      }
      setToast(body.error ?? "שליחת השאלה נכשלה.");
      return;
    }

    setDraftByFile((current) => ({ ...current, [fileId]: "" }));
    setQuestionsByFile((current) => ({
      ...current,
      [fileId]: [...(current[fileId] ?? []), body.question as FileQuestion]
    }));
  }

  return (
    <AppShell currentUser={currentUser} active="files">
      <section className="schedule-toolbar">
        <div>
          <p className="eyebrow">Wecomconnect</p>
          <h1>קבצים משותפים</h1>
        </div>
      </section>

      {isLoading ? (
        <p className="empty-state">טוען...</p>
      ) : isLocked ? (
        <div className="files-lock-card">
          <div className="files-lock-icon">
            <Lock size={22} />
          </div>
          <h2>נדרש קוד גישה</h2>
          <p>יש להזין את קוד הגישה לקבצים המשותפים כדי לצפות, לשאול שאלות ולהוריד קבצים.</p>
          <form onSubmit={handleUnlock} className="files-lock-form">
            <input
              type="password"
              inputMode="numeric"
              placeholder="קוד גישה"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              autoFocus
            />
            <button className="primary-button" disabled={isUnlocking || !accessCode}>
              {isUnlocking ? "בודק..." : "כניסה"}
            </button>
          </form>
          {unlockError ? <p className="form-error">{unlockError}</p> : null}
        </div>
      ) : (
        <>
          <form className="file-upload-form" ref={formRef} onSubmit={handleUpload}>
            <input type="file" name="file" required accept=".pdf,.docx,.xlsx,.xlsm,.csv,.txt" />
            <button className="primary-button" disabled={isUploading}>
              <Upload size={16} />
              {isUploading ? "מעלה..." : "העלאת קובץ"}
            </button>
          </form>

          {files.length === 0 ? (
            <p className="empty-state">עדיין לא הועלו קבצים.</p>
          ) : (
            <div className="file-list">
              {files.map((file) => (
                <article className="file-card" key={file.id}>
                  <div className="file-card-main">
                    <div className="file-card-icon">{fileIcon(file.filename)}</div>
                    <div className="file-card-info">
                      <strong>{file.filename}</strong>
                      <span>
                        {file.uploadedByName} · {formatSize(file.sizeBytes)} ·{" "}
                        {formatDate(file.createdAt)}
                      </span>
                    </div>
                    <div className="file-card-actions">
                      <a className="icon-button" href={`/api/files/${file.id}/download`} title="הורדה">
                        <Download size={16} />
                      </a>
                      <button
                        className="icon-button"
                        title="שאלה על הקובץ"
                        onClick={() => toggleQuestions(file.id)}
                      >
                        <MessageCircleQuestion size={16} />
                      </button>
                      {file.uploadedByUserId === currentUser.id || currentUser.role === "MANAGER" ? (
                        <button
                          className="icon-button"
                          title="מחיקה"
                          onClick={() => handleDelete(file)}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {expandedFileId === file.id ? (
                    <div className="file-qa-panel">
                      {!file.hasExtractedText ? (
                        <p className="file-qa-hint">
                          לא ניתן היה לחלץ טקסט מהקובץ הזה לצורך מענה אוטומטי.
                        </p>
                      ) : null}
                      <div className="file-qa-thread">
                        {(questionsByFile[file.id] ?? []).map((item) => (
                          <div className="file-qa-item" key={item.id}>
                            <p className="file-qa-question">
                              <strong>{item.askedByName}:</strong> {item.question}
                            </p>
                            <p className="file-qa-answer">{item.answer}</p>
                          </div>
                        ))}
                        {(questionsByFile[file.id] ?? []).length === 0 ? (
                          <p className="file-qa-hint">אין עדיין שאלות על הקובץ הזה.</p>
                        ) : null}
                      </div>
                      <div className="file-qa-input">
                        <input
                          type="text"
                          placeholder="שאלו שאלה על תוכן הקובץ..."
                          value={draftByFile[file.id] ?? ""}
                          onChange={(event) =>
                            setDraftByFile((current) => ({
                              ...current,
                              [file.id]: event.target.value
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleAsk(file.id);
                            }
                          }}
                        />
                        <button
                          className="icon-button"
                          disabled={askingFileId === file.id}
                          onClick={() => handleAsk(file.id)}
                          title="שליחה"
                        >
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {toast ? (
        <button className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      ) : null}
    </AppShell>
  );
}

function fileIcon(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    return <FileText size={20} />;
  }
  if (extension === "xlsx" || extension === "xlsm" || extension === "csv") {
    return <FileSpreadsheet size={20} />;
  }
  if (extension === "docx" || extension === "txt") {
    return <FileText size={20} />;
  }
  return <FileIcon size={20} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateOnly));
}
