const TOKEN_KEY = 'workhub.token';

export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || '';
export const setToken = (token: string) => sessionStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);
