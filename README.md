
# WPS5 Home

<img width="1917" height="1079" alt="image" src="https://github.com/user-attachments/assets/c0711ef9-d5ae-4e50-bc9f-06c4f9268023" />

# Custom your Home

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/c49200b0-ee0d-40fe-bfab-e13d4e20fda2" />

# Profile
<img width="1918" height="1078" alt="image" src="https://github.com/user-attachments/assets/d04ed85a-2b9f-45d6-8a18-1f7c465d04e9" />

# Media
<img width="1227" height="728" alt="Captura de pantalla 2026-08-13 151133" src="https://github.com/user-attachments/assets/ef804b17-f7d0-464f-a364-5efa23121de2" />

# Floating Menu

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/c1d4d9b0-58ba-4565-b65f-d8049e461613" />

# Wallpaper selector

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/b6be74e0-10ec-4e45-b5f2-0f616b68e62c" />

# Search

<img width="1919" height="1079" alt="SearchGuide" src="https://github.com/user-attachments/assets/b4cb842a-aaa8-4cd5-acb3-4568d1108c89" />






# Library & Steam

<img width="1913" height="1079" alt="image" src="https://github.com/user-attachments/assets/077837a6-9120-416c-ad0a-d70392b4ef91" />

<img width="1908" height="1079" alt="image" src="https://github.com/user-attachments/assets/4bcff8e0-dcdc-4253-9138-c09d17ae8683" />




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
