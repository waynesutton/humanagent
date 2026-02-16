import { sileo, type SileoOptions } from "sileo";

type PromiseFactory<T> = Promise<T> | (() => Promise<T>);

const baseOptions: Pick<
  SileoOptions,
  "position" | "roundness" | "fill" | "duration"
> = {
  position: "top-right",
  roundness: 1,
  fill: "#111827",
  duration: 2400,
};

function showDismissible(
  show: (options: SileoOptions) => string,
  options: SileoOptions
) {
  let toastId = "";
  toastId = show({
    ...options,
    button: {
      title: "x",
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
    sileo.action({
      ...baseOptions,
      title,
      description,
      duration: 10000,
      button: {
        title: buttonTitle,
        onClick: () => {
          void onConfirm();
        },
      },
    });
  },
};
