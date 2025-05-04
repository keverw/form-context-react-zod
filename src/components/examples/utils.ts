// Simulated server delay
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Simulated server validation
export const simulateServer = async (values: any) => {
  await delay(1000);
  const errors = [];

  if (values.firstName?.toLowerCase() === 'magic') {
    return [
      { path: ['firstName'], message: 'This name is reserved' },
      { path: ['firstName'], message: 'Cannot use magic words' },
      { path: ['firstName'], message: 'Please choose a different name' },
    ];
  }

  if (values.email === 'taken@example.com') {
    errors.push({ path: ['email'], message: 'Email already taken' });
  }

  if (
    values.username === 'admin' ||
    values.username === 'root' ||
    values.username === 'taken'
  ) {
    return [{ path: ['username'], message: 'Username is not available' }];
  }

  if (values.email?.includes('admin')) {
    errors.push({
      path: [],
      message: 'Administrative accounts cannot be created through this form',
    });
  }

  if (values.user?.profile?.name === 'admin') {
    errors.push({
      path: ['user', 'profile', 'name'],
      message: 'Reserved username',
    });
  }

  if (values.todos?.some((todo: any) => todo.text.includes('bad'))) {
    errors.push({
      path: [],
      message: 'Todo list contains inappropriate content',
    });
  }

  return errors;
};
