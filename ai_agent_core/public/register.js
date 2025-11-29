document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.querySelector('form'); // Select the form
    const errorMessageDiv = document.getElementById('error-message');
    // const urlParams = new URLSearchParams(window.location.search);
    // const error = urlParams.get('error');

    // // Display messages from URL parameters (e.g., if redirected with an error)
    // if (error) {
    //     let message = 'An unexpected error occurred. Please try again.';
    //     if (error === 'username_exists') {
    //         message = 'Username already exists. Please choose another one.';
    //     } else if (error === 'email_exists') {
    //         message = 'Email already registered. Please use a different email or log in.';
    //     } else if (error === 'server_error') {
    //         message = 'Server error during registration. Please try again later.';
    //     }
    //     errorMessageDiv.textContent = message;
    //     errorMessageDiv.style.display = 'block';
    //     errorMessageDiv.style.color = '#ff6b6b'; // Use styleRL.css error color
    //     errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)'; // Use styleRL.css error background
    //     errorMessageDiv.style.border = '1px solid #ff6b6b'; // Use styleRL.css error border
    // }

    // Handle form submission with Fetch API
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            // Clear previous error messages
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none';

            const usernameInput = document.getElementById('username');
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');

            const username = usernameInput.value;
            const email = emailInput.value;
            const password = passwordInput.value;

            try {
                const response = await fetch('/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, email, password }),
                });

                if (response.ok) {
                    // Registration successful, redirect to login page with a success message
                    window.location.href = '/auth/login?success=registered';
                } else {
                    // Handle errors
                    const data = await response.json();
                    let message = data.error || 'Registration failed. Please try again.';
                     // Map server error keys to user-friendly messages
                    if (data.error === 'username_exists') {
                        message = 'Username already exists. Please choose another one.';
                    } else if (data.error === 'email_exists') {
                        message = 'Email already registered. Please use a different email or log in.';
                    } else if (data.error === 'server_error') {
                        message = 'Server error during registration. Please try again later.';
                    }
                    errorMessageDiv.textContent = message;
                    errorMessageDiv.style.display = 'block';
                    errorMessageDiv.style.color = '#ff6b6b';
                    errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                    errorMessageDiv.style.border = '1px solid #ff6b6b';
                }
            } catch (err) {
                console.error('Registration fetch error:', err);
                errorMessageDiv.textContent = 'An network error occurred. Please try again.';
                errorMessageDiv.style.display = 'block';
                errorMessageDiv.style.color = '#ff6b6b';
                errorMessageDiv.style.backgroundColor = 'rgba(255, 107, 107, 0.1)';
                errorMessageDiv.style.border = '1px solid #ff6b6b';
            }
        });
    }
});