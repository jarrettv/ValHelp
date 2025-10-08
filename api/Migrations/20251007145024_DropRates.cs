using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ValHelpApi.Migrations
{
    /// <inheritdoc />
    public partial class DropRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "drop_rate_type",
                table: "scorings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "rates",
                table: "scorings",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "drop_rate_type",
                table: "scorings");

            migrationBuilder.DropColumn(
                name: "rates",
                table: "scorings");
        }
    }
}
