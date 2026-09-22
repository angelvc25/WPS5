
# WPS5

<img width="1918" height="821" alt="image" src="https://github.com/user-attachments/assets/2c550745-e102-46bf-959b-85869047adbc" />

# v1.1.4 AVAILABLE NOW!

# Custom your Home

<img width="1918" height="826" alt="Captura de pantalla 2026-09-06 234427" src="https://github.com/user-attachments/assets/7c8b0e29-6dfa-4f0f-8ba4-cae08399e01e" />

# Customize your Widgets

<img width="1917" height="823" alt="image" src="https://github.com/user-attachments/assets/93f42040-98d1-44b9-bb41-9720a055f402" />

# Game preview
<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/e35b75c0-7d32-4cb0-90ee-140c884651b3" />


# Profile
<img width="1918" height="1078" alt="image" src="https://github.com/user-attachments/assets/d04ed85a-2b9f-45d6-8a18-1f7c465d04e9" />

# Media
<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/260e444a-b3bf-44b4-823c-70502bb4ab59" />


# Floating Menu

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/756f059b-2fad-41ff-abd8-9dd283f2bc15" />


# Wallpaper selector

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/dda444eb-04bb-46d9-b305-54c2b009a234" />


# Search

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/5d33e1eb-e769-426b-bdd6-3a30bf54aeda" />







# Library & Steam

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/d816f2cf-7fb8-49d8-aa92-905d06a9840c" />


<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/297a4c7f-44fb-4914-9990-71698d8ab72e" />





# RELEASES
En el apartado de Release podras encontrar la version portable y el instalador para obtener el programa


# Guia de ejecución de proyecto.
Para desarrollo:

1. **Instalar Node.js:** Asegurarse de tener Node.js instalado en su sistema. (v24.12.0 o superior)
2. **Clonar/Descargar el repositorio:** Obtener el código fuente del proyecto.
3. **Abrir la terminal en la carpeta correcta:**
   cd frontend
4. **Instalar las dependencias:** (Solo la primera vez)
   npm install
5. **inciar servidor web:** npm run web
6. **Iniciar API de PlayStation Store (primera vez):**
   cd ../backend
   npm install
   cd ../frontend
7. **espere a que se inicie la web:**
8. **Iniciar la aplicación (Modo Desarrollo):**
   npm run electron:dev

*Nota: `electron:dev` levanta el backend (puerto 3000) y Electron. El panel PlayStation Store consume `GET http://localhost:3000/api/store/deals`.*

---

Para compilar el proyecto y crear un instalador (.exe) listo para usar sin código:
1. Asegúrate de estar en la carpeta 'frontend'
2. Ejecuta: npm run electron:build
3. El instalador se guardará en la carpeta 'frontend/dist-electron'
