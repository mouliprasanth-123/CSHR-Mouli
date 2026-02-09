"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

export default function TestEngine() {
  const router = useRouter();
  const { category } = router.query;

  /* ================= STATE ================= */
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState("loading"); // loading | instructions | test | submitted
  const [timer, setTimer] = useState(() => {
    const saved = localStorage.getItem("remainingTime");
    return saved ? Number(saved) : 20 * 60;
  });
  const [autoSubmitReason, setAutoSubmitReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activityLog, setActivityLog] = useState([]);

  const submittedRef = useRef(false);
  const tabSwitchCountRef = useRef(0);
  const fullscreenExitCountRef = useRef(0);

  /* ================= HELPERS ================= */
  const logActivity = (event) => {
    setActivityLog((prev) => [
      ...prev,
      { event, time: new Date().toISOString() }
    ]);
  };

  const triggerAutoSubmit = (reason) => {
    if (submittedRef.current) return;
    logActivity("AUTO_SUBMIT");
    setAutoSubmitReason(reason);
    submitTest(true);
  };

  /* ================= LOAD QUESTIONS ================= */
  useEffect(() => {
    const stored = localStorage.getItem("questions");
    if (!stored) {
      alert("No active test found.");
      router.push("/");
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      setQuestions(parsed);

      const savedAnswers = localStorage.getItem("answers_backup");
      if (savedAnswers) setAnswers(JSON.parse(savedAnswers));

      setStep("instructions");
    } catch {
      alert("Invalid test data.");
      router.push("/");
    }
  }, [router]);

  /* ================= TIMER ================= */
  useEffect(() => {
    if (step !== "test") return;

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          localStorage.removeItem("remainingTime");
          triggerAutoSubmit("Time ended. Test auto-submitted.");
          clearInterval(interval);
          return 0;
        }
        const updated = prev - 1;
        localStorage.setItem("remainingTime", updated);
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  /* ================= SAVE ANSWERS ================= */
  useEffect(() => {
    if (step === "test") {
      localStorage.setItem("answers_backup", JSON.stringify(answers));
    }
  }, [answers, step]);

  /* ================= TAB / WINDOW SWITCH ================= */
  useEffect(() => {
    if (step !== "test") return;

    const handleBlur = () => {
      tabSwitchCountRef.current += 1;
      logActivity("WINDOW_BLUR");

      if (tabSwitchCountRef.current <= 2) {
        alert(`⚠ Warning ${tabSwitchCountRef.current}/2: Do not leave the test.`);
      } else {
        triggerAutoSubmit("Test auto-submitted due to leaving test window.");
      }
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [step]);

  /* ================= FULLSCREEN ================= */
  useEffect(() => {
    if (step !== "test") return;

    document.documentElement.requestFullscreen?.().catch(() => {});
  }, [step]);

  useEffect(() => {
    if (step !== "test") return;

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        fullscreenExitCountRef.current += 1;
        logActivity("FULLSCREEN_EXIT");

        if (fullscreenExitCountRef.current <= 1) {
          alert("⚠ Do not exit fullscreen. Next time test will be submitted.");
        } else {
          triggerAutoSubmit("Exited fullscreen multiple times.");
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [step]);

  /* ================= BLOCK RIGHT CLICK ================= */
  useEffect(() => {
    if (step !== "test") return;
    const block = (e) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, [step]);

  /* ================= BLOCK COPY / PASTE ================= */
  useEffect(() => {
    if (step !== "test") return;

    const blockKeys = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "v", "x", "a"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", blockKeys);
    return () => document.removeEventListener("keydown", blockKeys);
  }, [step]);

  /* ================= REFRESH DETECTION ================= */
  useEffect(() => {
    if (step !== "test") return;

    const handleBeforeUnload = (e) => {
      triggerAutoSubmit("Test auto-submitted due to refresh.");
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [step]);

  /* ================= INTERNET OFFLINE ================= */
  useEffect(() => {
    if (step !== "test") return;

    const handleOffline = () => {
      logActivity("INTERNET_OFFLINE");
      triggerAutoSubmit("Internet disconnected.");
    };

    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [step]);

  /* ================= SUBMIT ================= */
  const submitTest = async (forced = false) => {
    if (submittedRef.current) return;

    if (!forced && Object.keys(answers).length < questions.length) {
      alert("Answer all questions.");
      return;
    }

    submittedRef.current = true;
    setIsSubmitting(true);

    const studentId = localStorage.getItem("studentId");

    const formattedAnswers = Object.entries(answers).map(
      ([questionId, selectedAnswer]) => ({
        questionId: Number(questionId),
        selectedAnswer
      })
    );

    try {
      await fetch("https://career-school.co.in/api/tests/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: Number(studentId),
          answers: formattedAnswers,
          activityLog
        })
      });

      localStorage.removeItem("questions");
      localStorage.removeItem("answers_backup");
      localStorage.removeItem("remainingTime");
      setStep("submitted");
    } catch {
      alert("Submission failed.");
      submittedRef.current = false;
      setIsSubmitting(false);
    }
  };

  /* ================= UI ================= */
  const minutes = String(Math.floor(timer / 60)).padStart(2, "0");
  const seconds = String(timer % 60).padStart(2, "0");

  if (step === "loading") return <p>Loading...</p>;

  if (step === "instructions") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-6 rounded shadow max-w-md w-full">
          <h2 className="font-bold text-xl mb-4">Test Instructions</h2>
          <ul className="list-disc pl-5 text-sm space-y-2">
            <li>20 minutes duration</li>
            <li>No tab switching or fullscreen exit</li>
            <li>Auto-submit on violations</li>
          </ul>
          <button
            onClick={() => setStep("test")}
            className="mt-6 w-full bg-blue-600 text-white py-3 rounded font-bold"
          >
            Start Test
          </button>
        </div>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="text-center mt-10">
        <h2 className="text-xl font-bold">Test Submitted</h2>
        <p className="text-red-600">
          {autoSubmitReason || "Submitted successfully."}
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded"
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-6">
      <div className="sticky top-0 bg-white p-4 shadow flex justify-between rounded">
        <h2 className="font-bold capitalize">{category} Test</h2>
        <span className="font-bold text-red-600">
          ⏱ {minutes}:{seconds}
        </span>
      </div>

      <div className="max-w-3xl mx-auto mt-6">
        {questions.map((q, i) => (
          <div key={q.id} className="bg-white p-4 rounded shadow mb-4">
            <p className="font-semibold mb-3">
              {i + 1}. {q.question}
            </p>

            {[q.optionA, q.optionB, q.optionC, q.optionD].map((opt) => (
              <button
                key={opt}
                disabled={isSubmitting}
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                }
                className={`w-full text-left px-4 py-2 mb-2 border rounded ${
                  answers[q.id] === opt
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ))}

        <button
          onClick={() => submitTest()}
          disabled={isSubmitting}
          className="w-full bg-green-600 text-white py-3 rounded font-bold"
        >
          {isSubmitting ? "Submitting..." : "Submit Test"}
        </button>
      </div>
    </div>
  );
}
