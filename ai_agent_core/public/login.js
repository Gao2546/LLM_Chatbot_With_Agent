document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('form'); // Select the form
    const errorMessageDiv = document.getElementById('error-message');
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const success = urlParams.get('success');

    // Display messages from URL parameters (e.g., after registration)
    if (error) {
        let message = 'An unexpected error occurred. Please try again.';
        if (error === 'invalid_credentials') {
            message = 'Invalid username or password.';
        } else if (error === 'server_error') {
            message = 'Server error during login. Please try again later.';
        }
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
        errorMessageDiv.style.color = '#ff6b6b'; // Use styleRL.css error color
        errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)'; // Use styleRL.css error background
        errorMessageDiv.style.border = '1px solid #ff6b6b'; // Use styleRL.css error border
    } else if (success === 'registered') {
        errorMessageDiv.textContent = 'Registration successful! Please log in.';
        errorMessageDiv.style.display = 'block';
        errorMessageDiv.style.color = '#4dff4d'; // Success color (e.g., light green)
        errorMessageDiv.style.backgroundColor = 'rgba(77, 255, 77, 0.1)'; // Subtle green background
        errorMessageDiv.style.border = '1px solid #4dff4d'; // Green border
    }

    // Handle form submission with Fetch API
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            // Clear previous error messages
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none';

            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');

            const username = usernameInput.value;
            const password = passwordInput.value;

            try {
                const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                if (response.ok) {
                    // Login successful, redirect to the main page or dashboard
                    window.location.href = '/'; // Adjust redirect URL if needed
                } else {
                    // Handle errors
                    const data = await response.json();
                    let message = data.error || 'Login failed. Please try again.';
                    // Map server error keys to user-friendly messages if needed
                    if (data.error === 'invalid_credentials') {
                        message = 'Invalid username or password.';
                    } else if (data.error === 'server_error') {
                         message = 'Server error during login. Please try again later.';
                    }
                    errorMessageDiv.textContent = message;
                    errorMessageDiv.style.display = 'block';
                    errorMessageDiv.style.color = '#ff6b6b';
                    errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                    errorMessageDiv.style.border = '1px solid #ff6b6b';
                }
            } catch (err) {
                console.error('Login fetch error:', err);
                errorMessageDiv.textContent = 'An network error occurred. Please try again.';
                errorMessageDiv.style.display = 'block';
                errorMessageDiv.style.color = '#ff6b6b';
                errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                errorMessageDiv.style.border = '1px solid #ff6b6b';
            }
        });
    }
});