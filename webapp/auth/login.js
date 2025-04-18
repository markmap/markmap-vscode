// webapp/auth/login.js

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginSection = document.getElementById('login-section');
const signupSection = document.getElementById('signup-section');
const errorMessageDiv = document.getElementById('errorMessage');
const signupErrorMessageDiv = document.getElementById('signupErrorMessage');

function showLogin() {
    hideErrorMessages();
    loginSection.style.display = 'block';
    signupSection.style.display = 'none';
}

function showSignup() {
    hideErrorMessages();
    loginSection.style.display = 'none';
    signupSection.style.display = 'block';
}

function displayError(message, type = 'login') {
    const div = type === 'signup' ? signupErrorMessageDiv : errorMessageDiv;
    if (div) {
        div.textContent = message;
        div.style.display = 'block';
    } else {
        console.error("Error display div not found for type:", type);
    }
     console.error('Auth Error:', message); // Also log to console
}


function hideErrorMessages() {
    if (errorMessageDiv) errorMessageDiv.style.display = 'none';
    if (signupErrorMessageDiv) signupErrorMessageDiv.style.display = 'none';
}

// --- Event Listeners ---

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideErrorMessages();
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                // Successful login - redirect handled by server usually,
                // but we can force it client-side if needed.
                window.location.href = '/'; // Redirect to the main app
            } else {
                 // Try to parse error message from server
                let errorMsg = 'Login failed. Please check your email and password.';
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.message) {
                        errorMsg = errorData.message;
                    }
                } catch (parseError) {
                    console.error("Could not parse error response:", parseError);
                }
                displayError(errorMsg, 'login');
            }
        } catch (error) {
            console.error('Login request failed:', error);
            displayError('An error occurred during login. Please try again.', 'login');
        }
    });
} else {
    console.error("Login form not found");
}


if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideErrorMessages();
        const formData = new FormData(signupForm);
        const data = Object.fromEntries(formData.entries());

         // Basic client-side validation (add more as needed)
        if (!data.name || !data.username || !data.password) {
            displayError('Please fill in all fields.', 'signup');
            return;
        }
        if (data.password.length < 6) { // Example minimum length
             displayError('Password must be at least 6 characters long.', 'signup');
            return;
        }


        try {
            const response = await fetch('/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                 // Successful signup often logs the user in automatically
                window.location.href = '/'; // Redirect to the main app
            } else {
                 // Try to parse error message from server
                let errorMsg = 'Sign up failed. Please try again.';
                 try {
                    const errorData = await response.json();
                     if (errorData && errorData.message) {
                        errorMsg = errorData.message;
                    }
                } catch (parseError) {
                     console.error("Could not parse error response:", parseError);
                }
                displayError(errorMsg, 'signup');
            }
        } catch (error) {
            console.error('Signup request failed:', error);
            displayError('An error occurred during sign up. Please try again.', 'signup');
        }
    });
} else {
     console.error("Signup form not found");
}


// Initial setup: Ensure error messages are hidden on load
hideErrorMessages();

// Check for query parameters indicating errors from redirects (e.g., from server-side)
const urlParams = new URLSearchParams(window.location.search);
const loginError = urlParams.get('loginError');
const signupError = urlParams.get('signupError');

if (loginError) {
    displayError(decodeURIComponent(loginError), 'login');
    showLogin(); // Ensure login form is visible
} else if (signupError) {
     displayError(decodeURIComponent(signupError), 'signup');
     showSignup(); // Ensure signup form is visible
} else {
    showLogin(); // Default view
}