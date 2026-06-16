// Web entry (`./web`). Re-exports the full core API (incl. the DOM-free
// `FormProvider`) and adds `WebFormProvider` — the same provider plus an HTML
// <form> wrapper (useFormTag, on by default). Web apps should typically use
// WebFormProvider; the bare FormProvider stays available for a no-<form> form.
export * from './index';
export {
  WebFormProvider,
  type WebFormProviderProps,
} from './form-provider-web';
