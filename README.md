
# WPS5

<img width="1916" height="1078" alt="image" src="https://github.com/user-attachments/assets/72ca1cec-0d78-4bfc-a8d2-979fe10f4304" />

<img width="1918" height="975" alt="image" src="https://github.com/user-attachments/assets/6efd997f-58b5-4df2-a4ca-c86f540969ad" />

<img width="1916" height="1077" alt="image" src="https://github.com/user-attachments/assets/731bbea8-c63c-41e0-a889-7e80d955fff4" />

<img width="1918" height="978" alt="image" src="https://github.com/user-attachments/assets/5dc22b35-0d5c-4855-b294-aea8d9c5d6f8" />



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
6. **espere a que se inicie la web:**
7. **Iniciar la aplicación (Modo Desarrollo):**
   npm run electron:dev

*Nota: Esto abrirá tanto el servidor de Expo como la ventana de la aplicación de escritorio.*

---

Para compilar el proyecto y crear un instalador (.exe) listo para usar sin código:
1. Asegúrate de estar en la carpeta 'frontend'
2. Ejecuta: npm run electron:build
3. El instalador se guardará en la carpeta 'frontend/dist-electron'
