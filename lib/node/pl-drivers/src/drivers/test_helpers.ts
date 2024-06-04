export const PL_STORAGE_TO_PATH = process.env.PL_STORAGE_TO_PATH
  ? Object.fromEntries(
    process.env.PL_STORAGE_TO_PATH
      .split(';')
      .map(kv => kv.split(':'))
) : {};
