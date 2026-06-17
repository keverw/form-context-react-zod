// Simulated server delay
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Simulated server validation
export interface ValidationError {
  path: (string | number)[];
  message: string;
}

export const simulateServer = async (
  values: Record<string, unknown>
): Promise<ValidationError[]> => {
  await delay(1000);
  const errors: ValidationError[] = [];

  if (
    typeof values.firstName === 'string' &&
    values.firstName.toLowerCase() === 'magic'
  ) {
    return [
      { path: ['firstName'], message: 'This name is reserved' },
      { path: ['firstName'], message: 'Cannot use magic words' },
      { path: ['firstName'], message: 'Please choose a different name' },
    ];
  }

  if (
    typeof values.email === 'string' &&
    values.email === 'taken@example.com'
  ) {
    errors.push({ path: ['email'], message: 'Email already taken' });
  }

  if (
    typeof values.username === 'string' &&
    (values.username === 'admin' ||
      values.username === 'root' ||
      values.username === 'taken')
  ) {
    return [{ path: ['username'], message: 'Username is not available' }];
  }

  if (typeof values.email === 'string' && values.email.includes('admin')) {
    errors.push({
      path: [],
      message: 'Administrative accounts cannot be created through this form',
    });
  }

  // Check for admin in nested user profile
  const user = values.user as Record<string, unknown> | undefined;
  if (user) {
    const profile = user.profile as Record<string, unknown> | undefined;
    if (
      profile &&
      typeof profile.name === 'string' &&
      profile.name === 'admin'
    ) {
      errors.push({
        path: ['user', 'profile', 'name'],
        message: 'Reserved username',
      });
    }
  }

  // Check for bad words in todos
  if (Array.isArray(values.todos)) {
    const hasBadTodo = values.todos.some((todo) => {
      if (typeof todo === 'object' && todo !== null) {
        const todoObj = todo as Record<string, unknown>;
        return typeof todoObj.text === 'string' && todoObj.text.includes('bad');
      }
      return false;
    });

    if (hasBadTodo) {
      errors.push({
        path: [],
        message: 'Todo list contains inappropriate content',
      });
    }
  }

  return errors;
};
