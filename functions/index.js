/**
 * Import function triggers from their respective sub-packages:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Inicializa o Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

// API Express para o Cardápio Online
const app = express();
app.use(cors({origin: true})); // Habilita CORS para a API do cardápio
app.use(express.json());

// Rota para buscar todos os produtos ativos
app.get("/produtos", async (req, res) => {
  try {
    const snapshot = await db.collection("produtos").where("status", "==", "Ativo").get();
    const products = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
    res.status(200).json(products);
  } catch (error) {
    logger.error("Erro ao buscar produtos:", error);
    res.status(500).send("Erro ao buscar produtos.");
  }
});

// Rota para buscar todos os clientes
app.get("/clientes", async (req, res) => {
    try {
        const snapshot = await db.collection("clientes").get();
        const clients = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(clients);
    } catch (error) {
        logger.error("Erro ao buscar clientes:", error);
        res.status(500).send("Erro ao buscar clientes.");
    }
});


// Rota para criar um novo cliente
app.post("/clientes", async (req, res) => {
    try {
        const newClient = req.body;
        const docRef = await db.collection("clientes").add(newClient);
        res.status(201).json({ id: docRef.id, ...newClient });
    } catch (error) {
        logger.error("Erro ao criar cliente:", error);
        res.status(500).send("Erro ao criar cliente.");
    }
});

// Rota para atualizar um cliente (adicionar endereço)
app.put("/clientes/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { newAddress } = req.body;
        const clientRef = db.collection("clientes").doc(id);

        await clientRef.update({
            enderecos: admin.firestore.FieldValue.arrayUnion(newAddress)
        });

        res.status(200).send("Endereço adicionado com sucesso.");
    } catch (error) {
        logger.error("Erro ao atualizar cliente:", error);
        res.status(500).send("Erro ao atualizar cliente.");
    }
});


// Rota para criar um novo pedido
app.post("/pedidos", async (req, res) => {
  try {
    const newOrder = {
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // Adiciona data de criação
    };
    const docRef = await db.collection("pedidos").add(newOrder);
    res.status(201).json({id: docRef.id});
  } catch (error) {
    logger.error("Erro ao criar pedido:", error);
    res.status(500).send("Erro ao criar pedido.");
  }
});

// Rota para calcular frete
app.post("/frete/calcular", async (req, res) => {
    try {
        const { clienteLat, clienteLng } = req.body;

        const configDoc = await db.collection("configuracoes").doc("frete").get();
        if (!configDoc.exists) {
            return res.status(404).json({ message: "Configuração de frete não encontrada." });
        }
        const freteConfig = configDoc.data();
        const lojaLat = freteConfig.lat;
        const lojaLng = freteConfig.lng;
        const valorPorKm = freteConfig.valorPorKm;

        function getDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Raio da Terra em km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        const distanciaKm = getDistance(lojaLat, lojaLng, clienteLat, clienteLng);
        const valorFrete = distanciaKm * valorPorKm;

        res.status(200).json({
            valorFrete: parseFloat(valorFrete.toFixed(2)),
            distanciaKm: distanciaKm.toFixed(2)
        });

    } catch (error) {
        logger.error("Erro ao calcular frete:", error);
        res.status(500).send("Erro ao calcular frete.");
    }
});


// Rota para verificar cupom
app.post("/cupons/verificar", async (req, res) => {
    const { codigo, totalCarrinho, telefone } = req.body;
    try {
        const cupomQuery = await db.collection("cupons").where("codigo", "==", codigo.toUpperCase()).limit(1).get();
        if (cupomQuery.empty) {
            return res.status(404).json({ valido: false, mensagem: "Cupom não encontrado." });
        }
        const cupomDoc = cupomQuery.docs[0];
        const cupom = { id: cupomDoc.id, ...cupomDoc.data() };

        if (cupom.status !== "Ativo") {
            return res.status(400).json({ valido: false, mensagem: "Este cupom não está ativo." });
        }
        if (cupom.limiteUso && cupom.usos >= cupom.limiteUso) {
            return res.status(400).json({ valido: false, mensagem: "Este cupom atingiu o limite de usos." });
        }
        if (cupom.valorMinimo && totalCarrinho < cupom.valorMinimo) {
            return res.status(400).json({ valido: false, mensagem: `O pedido mínimo para este cupom é de R$ ${cupom.valorMinimo.toFixed(2)}.` });
        }
        
        let valorDesconto = 0;
        if (cupom.tipoDesconto === 'percentual') {
            valorDesconto = (totalCarrinho * cupom.valor) / 100;
        } else {
            valorDesconto = cupom.valor;
        }
        
        cupom.valorDesconto = parseFloat(valorDesconto.toFixed(2));

        res.status(200).json({ valido: true, cupom });

    } catch (error) {
        logger.error("Erro ao verificar cupom:", error);
        res.status(500).send("Erro ao verificar cupom.");
    }
});

// Exporta o app Express como uma Cloud Function HTTP
exports.api = onRequest(app);


// --- FUNÇÕES CHAMÁVEIS (CALLABLE FUNCTIONS) PARA GERENCIAMENTO DE USUÁRIOS ---

// Função auxiliar para verificar se o usuário é admin
const verifyAdmin = async (uid) => {
    if (!uid) {
        throw new HttpsError("unauthenticated", "Você precisa estar autenticado.");
    }
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists || userDoc.data().role !== "admin") {
        throw new HttpsError("permission-denied", "Você não tem permissão para realizar esta ação.");
    }
};

// Lista todos os usuários
exports.listAllUsers = onCall(async (request) => {
    await verifyAdmin(request.auth?.uid);
    try {
        const listUsersResult = await auth.listUsers(1000);
        const usersFromAuth = listUsersResult.users;
        const usersFromFirestoreSnap = await db.collection("users").get();
        const usersDataFromFirestore = {};
        usersFromFirestoreSnap.forEach((doc) => {
            usersDataFromFirestore[doc.id] = doc.data();
        });

        const combinedUsers = usersFromAuth.map((userRecord) => {
            const firestoreData = usersDataFromFirestore[userRecord.uid] || {};
            return {
                uid: userRecord.uid,
                email: userRecord.email,
                nome: firestoreData.nome || userRecord.displayName || "Sem nome",
                role: firestoreData.role || "user",
            };
        });
        return {users: combinedUsers};
    } catch (error) {
        logger.error("Erro ao listar usuários:", error);
        throw new HttpsError("internal", "Não foi possível listar os usuários.");
    }
});

// Cria um novo usuário
exports.createUser = onCall(async (request) => {
    await verifyAdmin(request.auth?.uid);
    const {email, senha, nome, role} = request.data;
    try {
        const userRecord = await auth.createUser({
            email,
            password: senha,
            displayName: nome,
        });
        await db.collection("users").doc(userRecord.uid).set({
            email,
            nome,
            role,
        });
        return {uid: userRecord.uid, message: "Usuário criado com sucesso!"};
    } catch (error) {
        logger.error("Erro ao criar usuário:", error);
        throw new HttpsError("internal", `Erro ao criar usuário: ${error.message}`);
    }
});

// Atualiza um usuário
exports.updateUser = onCall(async (request) => {
    await verifyAdmin(request.auth?.uid);
    const { uid, nome, role, email } = request.data;

    if (!uid || !nome || !role || !email) {
        throw new HttpsError("invalid-argument", "Dados incompletos. UID, nome, role e email são obrigatórios.");
    }

    try {
        const authUpdatePayload = {
            displayName: nome,
        };

        const currentUser = await auth.getUser(uid);
        if (currentUser.email !== email) {
            authUpdatePayload.email = email;
        }

        await auth.updateUser(uid, authUpdatePayload);

        // **CORREÇÃO APLICADA AQUI**
        // Troca `update` por `set` com `merge: true` para evitar erros
        // caso o documento do usuário não exista no Firestore.
        await db.collection("users").doc(uid).set({
            nome: nome,
            role: role,
            email: email,
        }, { merge: true });

        return { message: "Usuário atualizado com sucesso!" };
    } catch (error) {
        logger.error("Erro detalhado ao atualizar usuário:", {
            code: error.code,
            message: error.message,
            uid: uid,
        });
        
        const detailedMessage = `Não foi possível atualizar o usuário. Motivo: ${error.message || 'Erro interno no servidor.'}`;

        if (error.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "O email fornecido já está em uso por outro usuário.");
        }
        
        throw new HttpsError("internal", detailedMessage, { originalCode: error.code });
    }
});

// Deleta um usuário
exports.deleteUser = onCall(async (request) => {
    await verifyAdmin(request.auth?.uid);
    const {uid} = request.data;
    try {
        await auth.deleteUser(uid);
        await db.collection("users").doc(uid).delete();
        return {message: "Usuário deletado com sucesso!"};
    } catch (error) {
        logger.error("Erro ao deletar usuário:", error);
        throw new HttpsError("internal", "Não foi possível deletar o usuário.");
    }
});

// Atualiza a senha de um usuário
exports.updateUserPassword = onCall(async (request) => {
    await verifyAdmin(request.auth?.uid);
    const {uid, newPassword} = request.data;
    try {
        await auth.updateUser(uid, {password: newPassword});
        return {message: "Senha alterada com sucesso!"};
    } catch (error) {
        logger.error("Erro ao alterar senha:", error);
        throw new HttpsError("internal", "Não foi possível alterar a senha.");
    }
});

exports.notifyNewOrder = onDocumentCreated("pedidos/{pedidoId}", async (event) => {
    const orderData = event.data?.data();

    if (!orderData) {
        logger.warn("Novo pedido criado sem dados. Notificação não enviada.");
        return;
    }

    try {
        const tokensSnapshot = await db.collection("notificationTokens").get();

        if (tokensSnapshot.empty) {
            logger.info("Nenhum token de notificação cadastrado. Ignorando envio de push.");
            return;
        }

        const tokens = tokensSnapshot.docs.map((doc) => doc.id);
        const orderId = String(event.params?.pedidoId || "");
        const status = orderData.status ? String(orderData.status) : "Pendente";
        const customerName = orderData.clienteNome || orderData.nomeCliente || orderData.nome || orderData.cliente?.nome || "";
        const orderCode = orderData.numeroPedido || orderData.codigo || orderData.numero || "";

        const title = "Novo pedido recebido";
        let body = customerName ? `Pedido de ${customerName}` : "Um novo pedido foi recebido.";
        if (orderCode) {
            body = `${body} (#${orderCode})`;
        }

        const message = {
            tokens,
            notification: {
                title,
                body,
            },
            data: {
                orderId,
                status,
                url: "/",
                source: "new-order",
            },
            android: {
                priority: "high",
                notification: {
                    title,
                    body,
                    channelId: "new-orders",
                    sound: "default",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                },
            },
            apns: {
                payload: {
                    aps: {
                        alert: {
                            title,
                            body,
                        },
                        sound: "default",
                        category: "NEW_ORDER",
                    },
                },
            },
            webpush: {
                headers: {
                    Urgency: "high",
                },
                notification: {
                    title,
                    body,
                    icon: "/logo192.png",
                    badge: "/logo192.png",
                    tag: "new-order",
                    renotify: true,
                    vibrate: [200, 100, 200],
                    data: {
                        orderId,
                        url: "/",
                    },
                },
                fcmOptions: {
                    link: "/",
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        const tokensToDelete = [];

        response.responses.forEach((res, index) => {
            if (!res.success) {
                const errorCode = res.error?.code;
                logger.error("Falha ao enviar notificação push:", res.error);

                if (errorCode === "messaging/registration-token-not-registered" || errorCode === "messaging/invalid-registration-token") {
                    tokensToDelete.push(tokens[index]);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            await Promise.all(tokensToDelete.map((token) => db.collection("notificationTokens").doc(token).delete().catch((error) => {
                logger.error("Erro ao remover token inválido:", error);
            })));
        }
    } catch (error) {
        logger.error("Erro ao enviar notificações de novo pedido:", error);
    }
});
