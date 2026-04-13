/**********************************************************************************************************************************************************/
/* INICAR SESIÓN */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const usuario = document.getElementById('usuario').value;
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('error-message');

    // Limpiar mensaje anterior
    errorBox.style.display = 'none';
    errorBox.innerText = '';

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ usuario, password })
        });

        const data = await response.json();

        if (data.success) {
            // Si es correcto, redirigimos al dashboard
            window.location.href = data.redirect;
        } else {
            // Si falla, mostramos el mensaje de error
            errorBox.innerText = data.message;
            errorBox.style.display = 'block';
        }
    } catch (error) {
        errorBox.innerText = "Error crítico en la comunicación.";
        errorBox.style.display = 'block';
    }
});

const togglePassword = document.querySelector('#togglePassword');
const passwordInput = document.querySelector('#password');
const eyeOpen = document.querySelector('#eye-open');
const eyeClosed = document.querySelector('#eye-closed');

togglePassword.addEventListener('click', function () {
    // Alternar el tipo de input
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    
    // Alternar la visibilidad de los iconos
    if (isPassword) {
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
});


