import { useEffect } from 'react';

const Login = () => {
  useEffect(() => {
    // Redirect to Flask backend login route
    window.location.href = '/login';
    
    // For debugging
    console.log('Login component mounted, redirecting to /login');
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Redirecting to login...</h1>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    </div>
  );
};

export default Login;