"use client";

import {
  BellRing,
  Check,
  Download,
  EllipsisVertical,
  ExternalLink,
  Menu,
  MoreHorizontal,
  Share,
  Smartphone,
  SquarePlus,
  X
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  dismissInstallBanner,
  promptInstall,
  shouldOfferInstall,
  useInstallApp,
  type InstallState
} from "@/hooks/useInstallApp";
import type { InstallPlatform } from "@/lib/installPlatform";

// Opens the browser's install window where there is one (Android), otherwise the
// step-by-step guide (iPhone, or when the browser didn't offer its window).
function useInstallAction(state: InstallState | null) {
  const [guideOpen, setGuideOpen] = useState(false);

  async function install() {
    if (state?.canPrompt && (await promptInstall())) {
      return;
    }
    if (!state?.canPrompt) {
      setGuideOpen(true);
    }
  }

  const guide =
    guideOpen && state ? <InstallGuideDialog platform={state.platform} onClose={() => setGuideOpen(false)} /> : null;
  return { install, guide };
}

/** Dismissible card inviting the user to add the app to their home screen. */
export function InstallAppBanner() {
  const state = useInstallApp();
  const { install, guide } = useInstallAction(state);

  if (!shouldOfferInstall(state)) {
    return null;
  }

  return (
    <>
      {state.bannerDismissed ? null : (
        <section className="install-banner" aria-label="התקנת האפליקציה">
          <span className="install-banner-icon">
            <Smartphone size={22} />
          </span>
          <div className="install-banner-text">
            <strong>התקינו את Wecom בטלפון</strong>
            <span>פתיחה מהירה ממסך הבית וקבלת התראות על משמרות ובקשות.</span>
          </div>
          <button type="button" className="primary-button install-banner-action" onClick={install}>
            <Download size={16} />
            התקנה
          </button>
          <button
            type="button"
            className="install-banner-close"
            onClick={dismissInstallBanner}
            title="לא עכשיו"
            aria-label="סגירת הצעת ההתקנה"
          >
            <X size={16} />
          </button>
        </section>
      )}
      {guide}
    </>
  );
}

/** Top-bar button that stays available after the banner is closed. */
export function InstallAppButton() {
  const state = useInstallApp();
  const { install, guide } = useInstallAction(state);

  if (!shouldOfferInstall(state)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="icon-button install-app-button"
        onClick={install}
        title="התקנת האפליקציה"
        aria-label="התקנת האפליקציה בטלפון"
      >
        <Smartphone size={18} />
      </button>
      {guide}
    </>
  );
}

interface GuideStep {
  icon: ReactNode;
  text: ReactNode;
}

// The menu item's name on a phone set to English.
function EnglishLabel({ children }: { children: ReactNode }) {
  return (
    <small className="install-step-english" dir="ltr">
      {children}
    </small>
  );
}

const openAppStep: GuideStep = {
  icon: <Smartphone size={18} />,
  text: (
    <>
      פתחו את <b>Wecom</b> מהאייקון החדש במסך הבית והתחברו.
    </>
  )
};

const notificationsStep: GuideStep = {
  icon: <BellRing size={18} />,
  text: (
    <>
      באפליקציה, לחצו על הפעמון ← <b>&quot;הפעלת התראות&quot;</b> ואשרו.
    </>
  )
};

function guideFor(platform: InstallPlatform): { title: string; steps: GuideStep[]; note?: ReactNode } {
  switch (platform) {
    case "ios-safari":
      return {
        title: "התקנה באייפון",
        steps: [
          {
            icon: <Share size={18} />,
            text: (
              <>
                לחצו על כפתור <b>השיתוף</b> (ריבוע עם חץ למעלה) בסרגל של ספארי. אם אינו מופיע, לחצו
                קודם על <MoreHorizontal size={14} className="install-inline-icon" />.
              </>
            )
          },
          {
            icon: <SquarePlus size={18} />,
            text: (
              <>
                גללו ובחרו <b>&quot;הוספה למסך הבית&quot;</b>.
                <EnglishLabel>Add to Home Screen</EnglishLabel>
              </>
            )
          },
          {
            icon: <Check size={18} />,
            text: (
              <>
                לחצו <b>&quot;הוספה&quot;</b> בפינה העליונה.
                <EnglishLabel>Add</EnglishLabel>
              </>
            )
          },
          openAppStep,
          notificationsStep
        ],
        note: "באייפון צריך להתחבר פעם אחת גם בתוך האפליקציה. התראות דורשות iOS 16.4 ומעלה."
      };
    case "ios-other-browser":
      return {
        title: "התקנה באייפון",
        steps: [
          {
            icon: <Share size={18} />,
            text: (
              <>
                לחצו על כפתור <b>השיתוף</b>. בכרום הוא נמצא ליד שורת הכתובת, ובדפדפנים אחרים בתוך התפריט.
              </>
            )
          },
          {
            icon: <SquarePlus size={18} />,
            text: (
              <>
                בחרו <b>&quot;הוספה למסך הבית&quot;</b> ואשרו.
                <EnglishLabel>Add to Home Screen</EnglishLabel>
              </>
            )
          },
          openAppStep,
          notificationsStep
        ],
        note: "אם האפשרות לא מופיעה, פתחו את האתר בספארי והתקינו משם. התראות דורשות iOS 16.4 ומעלה."
      };
    case "in-app-browser":
      return {
        title: "פתחו קודם בדפדפן",
        steps: [
          {
            icon: <MoreHorizontal size={18} />,
            text: <>הדף נפתח בתוך אפליקציה אחרת. לחצו על התפריט (⋯) בפינת המסך.</>
          },
          {
            icon: <ExternalLink size={18} />,
            text: (
              <>
                בחרו <b>&quot;פתיחה בדפדפן&quot;</b> (ספארי באייפון, כרום באנדרואיד).
              </>
            )
          },
          {
            icon: <Download size={18} />,
            text: <>בדפדפן, לחצו שוב על &quot;התקנה&quot;.</>
          }
        ]
      };
    case "samsung-internet":
      return {
        title: "התקנה בסמסונג",
        steps: [
          {
            icon: <Menu size={18} />,
            text: (
              <>
                לחצו על כפתור <b>התפריט</b> (☰) בסרגל התחתון.
              </>
            )
          },
          {
            icon: <SquarePlus size={18} />,
            text: (
              <>
                בחרו <b>&quot;הוספת דף אל&quot;</b> ← <b>&quot;מסך הבית&quot;</b>, ואשרו.
                <EnglishLabel>Add page to → Home screen</EnglishLabel>
              </>
            )
          },
          openAppStep,
          notificationsStep
        ],
        note: "אם מופיע סמל התקנה בשורת הכתובת, אפשר ללחוץ עליו במקום."
      };
    case "android":
      return {
        title: "התקנה באנדרואיד",
        steps: [
          {
            icon: <EllipsisVertical size={18} />,
            text: (
              <>
                לחצו על <b>⋮</b> בפינה העליונה של כרום.
              </>
            )
          },
          {
            icon: <SquarePlus size={18} />,
            text: (
              <>
                בחרו <b>&quot;התקנת אפליקציה&quot;</b> או <b>&quot;הוספה למסך הבית&quot;</b>, ואשרו.
                <EnglishLabel>Install app / Add to Home screen</EnglishLabel>
              </>
            )
          },
          openAppStep,
          notificationsStep
        ]
      };
    case "desktop":
      return {
        title: "התקנת האפליקציה",
        steps: [
          {
            icon: <Download size={18} />,
            text: <>בכרום או באדג׳, לחצו על סמל ההתקנה בצד שורת הכתובת.</>
          }
        ],
        note: "הכי נוח להתקין מהטלפון: פתחו את האתר בטלפון ולחצו על \"התקנה\"."
      };
  }
}

export function InstallGuideDialog({ platform, onClose }: { platform: InstallPlatform; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const { title, steps, note } = guideFor(platform);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
        <div className="dialog-title">
          <div>
            <h2 id="install-guide-title">{title}</h2>
            <p>כך Wecom יופיע כאפליקציה במסך הבית.</p>
          </div>
          <button ref={closeRef} type="button" className="icon-button" onClick={onClose} title="סגירה">
            <X size={18} />
          </button>
        </div>
        <ol className="install-steps">
          {steps.map((step, index) => (
            <li key={index}>
              <span className="install-step-number">{index + 1}</span>
              <span className="install-step-icon">{step.icon}</span>
              <span className="install-step-text">{step.text}</span>
            </li>
          ))}
        </ol>
        {note ? <p className="install-note">{note}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            הבנתי
          </button>
        </div>
      </section>
    </div>
  );
}
