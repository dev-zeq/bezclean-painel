(function (root) {
  "use strict";

  // Data base fictícia da demonstração: Sexta-feira, 20 de Novembro de 2026, às 09:45.
  // Todos os nomes, telefones, endereços e valores são fictícios para ilustração.
  const DEMO_NOW = new Date(2026, 10, 20, 9, 45, 0);
  const DEMO_TODAY = new Date(2026, 10, 20, 0, 0, 0);

  function iso(year, month, day, hour, minute) {
    return new Date(year, month - 1, day, hour, minute, 0).toISOString();
  }

  function createInitialEvents() {
    return [
      // Sexta 20/11 — Dia principal de demonstração
      {
        id: "ev-201",
        tipo: "estofados",
        status: "concluido",
        inicio_em: iso(2026, 11, 20, 8, 0),
        fim_em: iso(2026, 11, 20, 9, 30),
        cliente_id: "cli-02",
        clientes: {
          id: "cli-02",
          nome: "Roberto Almeida",
          telefone: "(47) 99123-4501",
          endereco: "Av. Nereu Ramos, 1280, Centro — Itapema"
        },
        apartamentos: null,
        endereco: "Av. Nereu Ramos, 1280, Centro — Itapema",
        descricao_servico: "Higienização de colchão casal + 2 travesseiros",
        agendamento_itens: [
          { nome: "Colchão casal (2 lados)", quantidade: 1, valor_unitario: 220, valor_total: 220 },
          { nome: "Higienização de travesseiro", quantidade: 2, valor_unitario: 20, valor_total: 40 }
        ],
        valor: 260,
        observacoes: "Porteiro liberou entrada na garagem lateral. Pagamento realizado via Pix."
      },
      {
        id: "ev-202",
        tipo: "estofados",
        status: "confirmado",
        inicio_em: iso(2026, 11, 20, 10, 30),
        fim_em: iso(2026, 11, 20, 12, 30),
        cliente_id: "cli-01",
        clientes: {
          id: "cli-01",
          nome: "Carla Mendes",
          telefone: "(47) 99911-2233",
          endereco: "Rua 234, nº 410, ap. 602, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 234, nº 410, ap. 602, Meia Praia — Itapema",
        descricao_servico: "Sofá retrátil 3 lugares + Impermeabilização",
        agendamento_itens: [
          { nome: "Sofá retrátil 3 lugares", quantidade: 1, valor_unitario: 260, valor_total: 260 },
          { nome: "Impermeabilização sofá 3 lug.", quantidade: 1, valor_unitario: 160, valor_total: 160 }
        ],
        valor: 420,
        observacoes: "Cachorro pequeno em casa. Manchas leves de café no módulo esquerdo; usar extratora silenciosa."
      },
      {
        id: "ev-203",
        tipo: "apartamento",
        status: "provisorio",
        inicio_em: iso(2026, 11, 20, 14, 0),
        fim_em: iso(2026, 11, 20, 16, 30),
        cliente_id: null,
        apartamento_id: "apt-402",
        clientes: null,
        apartamentos: {
          id: "apt-402",
          nome: "Apto 402 · Ed. Brisa Mar",
          edificio: "Ed. Brisa Mar",
          endereco: "Rua 280, nº 95, Meia Praia — Itapema",
          contato_nome: "Fernanda Costa",
          contato_telefone: "(47) 99655-1840",
          airbnb: true
        },
        endereco: "Ed. Brisa Mar · Rua 280, nº 95, Meia Praia — Itapema",
        descricao_servico: "Troca de hóspede (Airbnb)",
        agendamento_itens: [],
        valor: 290,
        observacoes: "Check-out às 11h; código da fechadura eletrônica enviado pela proprietária."
      },

      // Segunda 16/11
      {
        id: "ev-161",
        tipo: "faxina",
        status: "concluido",
        inicio_em: iso(2026, 11, 16, 8, 30),
        fim_em: iso(2026, 11, 16, 12, 30),
        cliente_id: "cli-03",
        clientes: {
          id: "cli-03",
          nome: "Juliana Ferreira",
          telefone: "(47) 99204-7788",
          endereco: "Rua 310, nº 55, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 310, nº 55, Meia Praia — Itapema",
        descricao_servico: "Faxina residencial completa (2 quartos)",
        agendamento_itens: [],
        valor: 340,
        observacoes: "Cliente pediu atenção especial nos vidros da sacada."
      },
      {
        id: "ev-162",
        tipo: "estofados",
        status: "concluido",
        inicio_em: iso(2026, 11, 16, 14, 0),
        fim_em: iso(2026, 11, 16, 16, 0),
        cliente_id: "cli-04",
        clientes: {
          id: "cli-04",
          nome: "Marcos Tavares",
          telefone: "(47) 99441-0909",
          endereco: "Rua 129, nº 312, Centro — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 129, nº 312, Centro — Itapema",
        descricao_servico: "6 cadeiras estofadas + poltrona",
        agendamento_itens: [
          { nome: "Cadeira estofada (assento + encosto)", quantidade: 6, valor_unitario: 35, valor_total: 210 },
          { nome: "Poltrona simples", quantidade: 1, valor_unitario: 110, valor_total: 110 }
        ],
        valor: 320,
        observacoes: "Tecido linho claro."
      },

      // Terça 17/11 — Inclui um cancelado (não deve somar no faturamento nem bloquear horário)
      {
        id: "ev-171",
        tipo: "apartamento",
        status: "concluido",
        inicio_em: iso(2026, 11, 17, 9, 0),
        fim_em: iso(2026, 11, 17, 12, 0),
        apartamento_id: "apt-305",
        clientes: null,
        apartamentos: {
          id: "apt-305",
          nome: "Apto 305 · Res. Atlântico",
          edificio: "Res. Atlântico",
          endereco: "Av. Beira Mar, 2100, Meia Praia — Itapema",
          contato_nome: "Eduardo Nogueira",
          contato_telefone: "(47) 99310-6622",
          airbnb: false
        },
        endereco: "Res. Atlântico · Av. Beira Mar, 2100, Meia Praia — Itapema",
        descricao_servico: "Limpeza completa de apartamento",
        agendamento_itens: [],
        valor: 280,
        observacoes: "Chave na portaria com Sr. João."
      },
      {
        id: "ev-172",
        tipo: "estofados",
        status: "cancelado",
        inicio_em: iso(2026, 11, 17, 14, 0),
        fim_em: iso(2026, 11, 17, 15, 30),
        cliente_id: "cli-05",
        clientes: {
          id: "cli-05",
          nome: "Patrícia Lima",
          telefone: "(47) 99812-3040",
          endereco: "Rua 264, nº 180, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 264, nº 180, Meia Praia — Itapema",
        descricao_servico: "Sofá 2 lugares",
        agendamento_itens: [],
        valor: 190,
        observacoes: "Cancelado pela cliente por viagem."
      },

      // Quarta 18/11 — Dia inteiro
      {
        id: "ev-181",
        tipo: "faxina",
        status: "concluido",
        inicio_em: iso(2026, 11, 18, 8, 0),
        fim_em: iso(2026, 11, 18, 17, 0),
        cliente_id: "cli-06",
        clientes: {
          id: "cli-06",
          nome: "Clínica Bem Estar",
          telefone: "(47) 99700-1122",
          endereco: "Av. Marginal Leste, 650, Centro — Balneário Camboriú"
        },
        apartamentos: null,
        endereco: "Av. Marginal Leste, 650, Centro — Balneário Camboriú",
        descricao_servico: "Limpeza pós-reforma comercial",
        agendamento_itens: [],
        valor: 780,
        observacoes: "Levar aspirador industrial e escada média."
      },

      // Quinta 19/11
      {
        id: "ev-191",
        tipo: "estofados",
        status: "concluido",
        inicio_em: iso(2026, 11, 19, 9, 0),
        fim_em: iso(2026, 11, 19, 11, 30),
        cliente_id: "cli-07",
        clientes: {
          id: "cli-07",
          nome: "Camila Duarte",
          telefone: "(47) 99511-4433",
          endereco: "Rua 406, nº 220, Morretes — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 406, nº 220, Morretes — Itapema",
        descricao_servico: "Sofá de canto 5 lugares + Puff",
        agendamento_itens: [
          { nome: "Sofá de canto 5 lugares", quantidade: 1, valor_unitario: 340, valor_total: 340 },
          { nome: "Puff grande", quantidade: 1, valor_unitario: 50, valor_total: 50 }
        ],
        valor: 390,
        observacoes: ""
      },

      // Sábado 21/11
      {
        id: "ev-211",
        tipo: "apartamento",
        status: "confirmado",
        inicio_em: iso(2026, 11, 21, 9, 30),
        fim_em: iso(2026, 11, 21, 12, 30),
        apartamento_id: "apt-402",
        clientes: null,
        apartamentos: {
          id: "apt-402",
          nome: "Apto 402 · Ed. Brisa Mar",
          edificio: "Ed. Brisa Mar",
          endereco: "Rua 280, nº 95, Meia Praia — Itapema",
          contato_nome: "Fernanda Costa",
          contato_telefone: "(47) 99655-1840",
          airbnb: true
        },
        endereco: "Ed. Brisa Mar · Rua 280, nº 95, Meia Praia — Itapema",
        descricao_servico: "Troca de hóspede (Airbnb)",
        agendamento_itens: [],
        valor: 290,
        observacoes: "Entram novos hóspedes às 15h. Trocar jogo de cama branco."
      },
      {
        id: "ev-212",
        tipo: "estofados",
        status: "confirmado",
        inicio_em: iso(2026, 11, 21, 14, 0),
        fim_em: iso(2026, 11, 21, 16, 0),
        cliente_id: "cli-08",
        clientes: {
          id: "cli-08",
          nome: "Lucas Ribeiro",
          telefone: "(47) 99188-9021",
          endereco: "Rua 248, nº 77, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 248, nº 77, Meia Praia — Itapema",
        descricao_servico: "Colchão queen + cabeceira estofada",
        agendamento_itens: [
          { nome: "Colchão queen (2 lados)", quantidade: 1, valor_unitario: 250, valor_total: 250 },
          { nome: "Cabeceira estofada", quantidade: 1, valor_unitario: 90, valor_total: 90 }
        ],
        valor: 340,
        observacoes: "Estacionamento para visitantes."
      },

      // Próxima semana (23 a 28/11) para visão mensal rica
      {
        id: "ev-231",
        tipo: "faxina",
        status: "confirmado",
        inicio_em: iso(2026, 11, 23, 8, 30),
        fim_em: iso(2026, 11, 23, 12, 30),
        cliente_id: "cli-03",
        clientes: {
          id: "cli-03",
          nome: "Juliana Ferreira",
          telefone: "(47) 99204-7788",
          endereco: "Rua 310, nº 55, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 310, nº 55, Meia Praia — Itapema",
        descricao_servico: "Faxina residencial semanal",
        agendamento_itens: [],
        valor: 260,
        observacoes: ""
      },
      {
        id: "ev-251",
        tipo: "estofados",
        status: "provisorio",
        inicio_em: iso(2026, 11, 25, 13, 30),
        fim_em: iso(2026, 11, 25, 15, 30),
        cliente_id: "cli-01",
        clientes: {
          id: "cli-01",
          nome: "Carla Mendes",
          telefone: "(47) 99911-2233",
          endereco: "Rua 234, nº 410, ap. 602, Meia Praia — Itapema"
        },
        apartamentos: null,
        endereco: "Rua 234, nº 410, ap. 602, Meia Praia — Itapema",
        descricao_servico: "Tapete sala 2,5m x 2,0m",
        agendamento_itens: [
          { nome: "Tapete médio até 5m²", quantidade: 1, valor_unitario: 180, valor_total: 180 }
        ],
        valor: 180,
        observacoes: "Aguardando confirmação da cliente pelo WhatsApp."
      },
      {
        id: "ev-271",
        tipo: "apartamento",
        status: "confirmado",
        inicio_em: iso(2026, 11, 27, 10, 0),
        fim_em: iso(2026, 11, 27, 13, 0),
        apartamento_id: "apt-402",
        clientes: null,
        apartamentos: {
          id: "apt-402",
          nome: "Apto 402 · Ed. Brisa Mar",
          edificio: "Ed. Brisa Mar",
          endereco: "Rua 280, nº 95, Meia Praia — Itapema",
          contato_nome: "Fernanda Costa",
          contato_telefone: "(47) 99655-1840",
          airbnb: true
        },
        endereco: "Ed. Brisa Mar · Rua 280, nº 95, Meia Praia — Itapema",
        descricao_servico: "Troca de hóspede (Airbnb)",
        agendamento_itens: [],
        valor: 290,
        observacoes: ""
      }
    ];
  }

  function createInitialBlocks() {
    return [
      {
        id: "blk-201",
        inicio_em: iso(2026, 11, 20, 16, 30),
        fim_em: iso(2026, 11, 20, 17, 30),
        motivo: "Manutenção da extratora"
      },
      {
        id: "blk-191",
        inicio_em: iso(2026, 11, 19, 13, 0),
        fim_em: iso(2026, 11, 19, 15, 0),
        motivo: "Consulta médica (Bruna)"
      },
      {
        id: "blk-241",
        inicio_em: iso(2026, 11, 24, 8, 0),
        fim_em: iso(2026, 11, 24, 12, 0),
        motivo: "Compra de insumos e revisão do veículo"
      }
    ];
  }

  const CLIENTS = [
    { id: "cli-01", nome: "Carla Mendes", telefone: "(47) 99911-2233", endereco: "Rua 234, nº 410, ap. 602, Meia Praia — Itapema" },
    { id: "cli-02", nome: "Roberto Almeida", telefone: "(47) 99123-4501", endereco: "Av. Nereu Ramos, 1280, Centro — Itapema" },
    { id: "cli-03", nome: "Juliana Ferreira", telefone: "(47) 99204-7788", endereco: "Rua 310, nº 55, Meia Praia — Itapema" },
    { id: "cli-04", nome: "Marcos Tavares", telefone: "(47) 99441-0909", endereco: "Rua 129, nº 312, Centro — Itapema" },
    { id: "cli-05", nome: "Patrícia Lima", telefone: "(47) 99812-3040", endereco: "Rua 264, nº 180, Meia Praia — Itapema" },
    { id: "cli-06", nome: "Clínica Bem Estar", telefone: "(47) 99700-1122", endereco: "Av. Marginal Leste, 650, Centro — Balneário Camboriú" },
    { id: "cli-07", nome: "Camila Duarte", telefone: "(47) 99511-4433", endereco: "Rua 406, nº 220, Morretes — Itapema" },
    { id: "cli-08", nome: "Lucas Ribeiro", telefone: "(47) 99188-9021", endereco: "Rua 248, nº 77, Meia Praia — Itapema" }
  ];

  const APARTMENTS = [
    {
      id: "apt-402",
      nome: "Apto 402 · Ed. Brisa Mar",
      edificio: "Ed. Brisa Mar",
      endereco: "Rua 280, nº 95, Meia Praia — Itapema",
      contato_nome: "Fernanda Costa",
      contato_telefone: "(47) 99655-1840",
      airbnb: true
    },
    {
      id: "apt-305",
      nome: "Apto 305 · Res. Atlântico",
      edificio: "Res. Atlântico",
      endereco: "Av. Beira Mar, 2100, Meia Praia — Itapema",
      contato_nome: "Eduardo Nogueira",
      contato_telefone: "(47) 99310-6622",
      airbnb: false
    },
    {
      id: "apt-108",
      nome: "Apto 108 · Ed. Costa Azul",
      edificio: "Ed. Costa Azul",
      endereco: "Rua 214, nº 40, Meia Praia — Itapema",
      contato_nome: "Silvana Prado",
      contato_telefone: "(47) 99732-1190",
      airbnb: true
    }
  ];

  const SERVICES_CATALOG = [
    { id: "srv-sofa3", nome: "Sofá retrátil 3 lugares", categoria: "Sofás", valor: 260 },
    { id: "srv-sofa5", nome: "Sofá de canto 5 lugares", categoria: "Sofás", valor: 340 },
    { id: "srv-imperm", nome: "Impermeabilização sofá 3 lug.", categoria: "Sofás", valor: 160 },
    { id: "srv-colchao-c", nome: "Colchão casal (2 lados)", categoria: "Colchões", valor: 220 },
    { id: "srv-colchao-q", nome: "Colchão queen (2 lados)", categoria: "Colchões", valor: 250 },
    { id: "srv-cadeira", nome: "Cadeira estofada (assento + encosto)", categoria: "Cadeiras", valor: 35 },
    { id: "srv-poltrona", nome: "Poltrona simples", categoria: "Poltronas", valor: 110 },
    { id: "srv-tapete", nome: "Tapete médio até 5m²", categoria: "Tapetes", valor: 180 }
  ];

  const CLEANING_OPTIONS = {
    faxina: [
      "Faxina residencial completa",
      "Limpeza pesada",
      "Limpeza pós-reforma",
      "Limpeza comercial"
    ],
    apartamento: [
      "Troca de hóspede (Airbnb)",
      "Limpeza de saída (check-out)",
      "Limpeza de entrada (check-in)",
      "Limpeza completa de apartamento"
    ]
  };

  root.BezMockData = {
    DEMO_NOW: DEMO_NOW,
    DEMO_TODAY: DEMO_TODAY,
    createInitialEvents: createInitialEvents,
    createInitialBlocks: createInitialBlocks,
    CLIENTS: CLIENTS,
    APARTMENTS: APARTMENTS,
    SERVICES_CATALOG: SERVICES_CATALOG,
    CLEANING_OPTIONS: CLEANING_OPTIONS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
