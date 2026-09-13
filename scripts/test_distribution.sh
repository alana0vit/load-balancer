#!/bin/bash
# Dispara N requisições ao load balancer e conta quantas cada instância atendeu.
# Uso: ./test_distribution.sh [numero_de_requisicoes] [url]

N=${1:-100}
URL=${2:-http://localhost:8080}

echo "Disparando $N requisições para $URL ..."
echo ""

declare -A COUNTS

for i in $(seq 1 "$N"); do
  SERVER=$(curl -s -D - "$URL" -o /dev/null | grep -i '^X-Served-By:' | tr -d '\r' | awk '{print $2}')
  if [ -z "$SERVER" ]; then
    SERVER="(sem resposta)"
  fi
  COUNTS[$SERVER]=$((${COUNTS[$SERVER]:-0} + 1))
done

echo "Resultado da distribuição:"
echo "----------------------------------"
for SERVER in "${!COUNTS[@]}"; do
  printf "%-15s -> %s requisições\n" "$SERVER" "${COUNTS[$SERVER]}"
done
echo "----------------------------------"
echo "Total: $N requisições"
