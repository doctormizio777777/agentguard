def create_action(client, agent_id, action_type, **values):
    return client.post(
        "/actions",
        json={
            "agent_id": agent_id,
            "action_type": action_type,
            **values,
        },
    )


def test_payment_5000_is_blocked_and_stored_in_cents(client, agent):
    response = create_action(
        client,
        agent["id"],
        "payment",
        amount=5000.00,
        counterparty="openai.com",
    )

    assert response.status_code == 201
    body = response.json()
    assert body["decision"] == "BLOCK"
    assert body["status"] == "blocked"
    assert body["amount"] == "5000.00"

    stored = client.get("/actions", params={"agent_id": agent["id"]}).json()[0]
    assert stored["amount"] == "5000.00"


def test_system_command_rm_is_blocked(client, agent):
    response = create_action(
        client,
        agent["id"],
        "system_command",
        counterparty="server",
        payload={"command": "rm -rf /data"},
    )

    assert response.status_code == 201
    assert response.json()["decision"] == "BLOCK"
    assert response.json()["status"] == "blocked"


def test_payment_700_pending_can_be_approved(client, agent):
    pending = create_action(
        client,
        agent["id"],
        "payment",
        amount=700.00,
        counterparty="openai.com",
    )

    assert pending.status_code == 201
    assert pending.json()["decision"] == "PENDING_APPROVAL"
    assert pending.json()["status"] == "pending_approval"

    approved = client.post(f"/actions/{pending.json()['id']}/approve")

    assert approved.status_code == 200
    assert approved.json()["status"] == "allowed"
    assert "human decision: approved" in approved.json()["policy_reason"]


def test_approving_non_pending_action_returns_conflict(client, agent):
    allowed = create_action(
        client,
        agent["id"],
        "payment",
        amount=200.00,
        counterparty="openai.com",
    )

    response = client.post(f"/actions/{allowed.json()['id']}/approve")

    assert response.status_code == 409


def test_email_random_domain_is_pending_and_21st_email_is_blocked(client, agent):
    random_domain = create_action(
        client,
        agent["id"],
        "email_send",
        counterparty="user@random-domain.com",
        payload={"subject": "test"},
    )
    assert random_domain.status_code == 201
    assert random_domain.json()["decision"] == "PENDING_APPROVAL"

    for _ in range(20):
        allowed = create_action(
            client,
            agent["id"],
            "email_send",
            counterparty="user@matteomisiani.studio",
            payload={"subject": "test"},
        )
        assert allowed.json()["status"] == "allowed"

    twenty_first = create_action(
        client,
        agent["id"],
        "email_send",
        counterparty="user@matteomisiani.studio",
        payload={"subject": "test"},
    )
    assert twenty_first.json()["decision"] == "BLOCK"
    assert twenty_first.json()["status"] == "blocked"


def test_invalid_action_and_missing_agent_return_4xx(client, agent):
    invalid_type = create_action(
        client,
        agent["id"],
        "not_supported",
        counterparty="target",
    )
    assert invalid_type.status_code == 422

    missing_agent = create_action(
        client,
        99999,
        "payment",
        amount=10.00,
        counterparty="openai.com",
    )
    assert missing_agent.status_code == 404


def test_actions_can_be_filtered_newest_first(client, agent):
    first = create_action(client, agent["id"], "payment", amount=10.00, counterparty="openai.com")
    second = create_action(client, agent["id"], "payment", amount=20.00, counterparty="openai.com")

    response = client.get("/actions", params={"agent_id": agent["id"], "status": "allowed"})

    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [second.json()["id"], first.json()["id"]]
