// js/notifications.js

/**
 * Exibe uma notificação estilizada.
 * @param {string} titulo - Título do card.
 * @param {string} mensagem - Mensagem detalhada.
 * @param {string} tipo - 'sucesso', 'erro', 'aviso', 'info'.
 * @param {number} duracao - Tempo em ms (Padrão: 3000ms = 3s).
 */
function mostrarNotificacao(titulo, mensagem, tipo = 'info', duracao = 3000) {
    
    // Configurações visuais
    let classeTipo = "toast-info";
    let icone = "i"; 

    if (tipo === 'sucesso') {
        classeTipo = "toast-success";
        icone = "✔";
    } else if (tipo === 'erro') {
        classeTipo = "toast-error";
        icone = "!"; // <--- MUDANÇA AQUI: Era X, agora é !
    } else if (tipo === 'aviso') {
        classeTipo = "toast-warning";
        icone = "!";
    }

    const htmlContent = `
        <div class="custom-toast ${classeTipo}">
            <div class="toast-icon">${icone}</div>
            <div class="toast-content">
                <span class="toast-title">${titulo}</span>
                <span class="toast-msg">${mensagem}</span>
            </div>
        </div>
    `;

    Toastify({
        text: "", 
        duration: duracao, // <--- USA O PARÂMETRO AGORA
        close: true, 
        gravity: "top",
        position: "right",
        stopOnFocus: true,
        escapeMarkup: false, 
        node: (function(){
            const div = document.createElement("div");
            div.innerHTML = htmlContent;
            return div.firstElementChild; 
        })(),
        onClick: function(){}
    }).showToast();
}