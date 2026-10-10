import { t } from "../../i18n/index.ts";
import type { CronFieldErrors, CronFieldKey, CronFormState } from "../../lib/cron/types.ts";
import { resolveScrollBehavior } from "../../lib/scroll-behavior.ts";

type BlockingField = {
  label: string;
  message: string;
  inputId: string;
};

const CRON_FIELD_LABELS: ReadonlyArray<readonly [CronFieldKey, string]> = [
  ["name", "cron.form.fieldName"],
  ["scheduleAt", "cron.form.runAt"],
  ["everyAmount", "cron.form.every"],
  ["cronExpr", "cron.form.expression"],
  ["staggerAmount", "cron.form.staggerWindow"],
  ["activeHoursStart", "cron.form.activeHoursStart"],
  ["activeHoursEnd", "cron.form.activeHoursEnd"],
  ["activeHoursTimezone", "cron.form.timezoneOptional"],
  ["triggerScript", "cron.form.triggerScript"],
  ["payloadText", "cron.form.assistantTaskPrompt"],
  ["payloadModel", "cron.form.model"],
  ["payloadThinking", "cron.form.thinking"],
  ["timeoutSeconds", "cron.form.timeoutSeconds"],
  ["deliveryMode", "cron.form.deliveryModeLabel"],
  ["deliveryDirectPolicy", "cron.form.directPolicy"],
  ["deliveryTo", "cron.form.to"],
  ["failureAlertAfter", "cron.form.failureAlertAfter"],
  ["failureAlertCooldownSeconds", "cron.form.failureAlertCooldown"],
];

export function errorIdForField(key: CronFieldKey) {
  return `cron-error-${key}`;
}

export function inputIdForField(key: string) {
  return `cron-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function fieldLabelForKey(
  key: CronFieldKey,
  labelKey: string,
  form: CronFormState,
  deliveryMode: CronFormState["deliveryMode"],
) {
  if (key === "payloadText" && form.payloadKind === "systemEvent") {
    return t("cron.form.mainTimelineMessage");
  }
  if (key === "deliveryTo" && deliveryMode === "webhook") {
    return t("cron.form.webhookUrl");
  }
  return t(labelKey);
}

export function collectBlockingFields(
  errors: CronFieldErrors,
  form: CronFormState,
  deliveryMode: CronFormState["deliveryMode"],
): BlockingField[] {
  return CRON_FIELD_LABELS.flatMap(([key, labelKey]) => {
    const message = errors[key];
    return message
      ? [
          {
            label: fieldLabelForKey(key, labelKey, form, deliveryMode),
            message,
            inputId: inputIdForField(key),
          },
        ]
      : [];
  });
}

export function focusFormField(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) {
    return;
  }
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "center", behavior: resolveScrollBehavior() });
  }
  el.focus();
}
