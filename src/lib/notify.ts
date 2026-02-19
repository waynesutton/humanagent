import { sileo, type SileoOptions } from "sileo";
import { createElement } from "react";

type PromiseFactory<T> = Promise<T> | (() => Promise<T>);

const DEFAULT_TOAST_DURATION_MS = 5400;
const DEFAULT_CONFIRM_DURATION_MS = 5400;

const baseOptions: Pick<
  SileoOptions,
  "position" | "roundness" | "fill" | "duration"
> = {
  position: "bottom-right",
  roundness: 18,
  fill: "#111827",
  duration: DEFAULT_TOAST_DURATION_MS,
};

function showDismissible(
  show: (options: SileoOptions) => string,
  options: SileoOptions
) {
  let toastId = "";
  toastId = show({
    ...options,
    autopilot: false,
    styles: {
      ...options.styles,
      button: "sileo-corner-dismiss sileo-corner-dismiss-only",
    },
    button: {
      title: "\u00d7",
      onClick: () => sileo.dismiss(toastId),
    },
  });
  return toastId;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export const notify = {
  success(title: string, description?: string) {
    showDismissible(sileo.success, {
      ...baseOptions,
      title,
      description,
    });
  },
  info(title: string, description?: string) {
    showDismissible(sileo.info, {
      ...baseOptions,
      title,
      description,
    });
  },
  warning(title: string, description?: string) {
    showDismissible(sileo.warning, {
      ...baseOptions,
      title,
      description,
    });
  },
  error(title: string, error?: unknown, fallback = "Please try again.") {
    showDismissible(sileo.error, {
      ...baseOptions,
      title,
      description: error ? getErrorMessage(error, fallback) : fallback,
    });
  },
  promise<T>(
    promise: PromiseFactory<T>,
    labels: {
      loading: string;
      success: string | ((result: T) => string);
      error: string;
    }
  ) {
    return sileo.promise(promise, {
      loading: { title: labels.loading },
      success: (result) => ({
        ...baseOptions,
        title:
          typeof labels.success === "function"
            ? labels.success(result)
            : labels.success,
      }),
      error: (error) => ({
        ...baseOptions,
        title: labels.error,
        description: getErrorMessage(error, labels.error),
      }),
      position: baseOptions.position,
    });
  },
  confirmAction({
    title,
    description,
    buttonTitle,
    onConfirm,
  }: {
    title: string;
    description: string;
    buttonTitle: string;
    onConfirm: () => void | Promise<void>;
  }) {
    let toastId = "";
    toastId = sileo.action({
      ...baseOptions,
      title,
      description: createElement(
        "div",
        { className: "sileo-confirm-description" },
        createElement("span", null, description),
        createElement(
          "button",
          {
            type: "button",
            className: "sileo-confirm-button",
            onClick: () => {
              void onConfirm();
              sileo.dismiss(toastId);
            },
          },
          buttonTitle
        )
      ),
      duration: DEFAULT_CONFIRM_DURATION_MS,
      autopilot: {
        expand: 0,
        collapse: DEFAULT_CONFIRM_DURATION_MS,
      },
      styles: {
        description: "sileo-confirm-description-wrap",
        button: "sileo-corner-dismiss sileo-corner-dismiss-action",
      },
      button: {
        title: "\u00d7",
        onClick: () => sileo.dismiss(toastId),
      },
    });
  },
};
